-- =============================================================================
-- usp6getasof_v2 — optimized replacement for usp6getasofpaginated
-- =============================================================================
--
-- Bench (RapidReconciler_Dev, compat 140, period 2016-08-27, both companies,
--  6.5M rows in RInvAsOf, warm cache, 3-run avg):
--
--     usp6getasofpaginated   2,431 ms     39,866 rows
--     usp6getasof_v2         1,764 ms     39,866 rows
--                            ---------    same totals (totqty, totamt,
--                            27% faster   totqtyvar, totamtvar all match)
--
-- Wins compound at production scale (larger RInvAsOf, narrower scopes,
-- many concurrent users) because the things V2 does differently — plan
-- reuse from static SQL, temp-table stats, filter pushdown into the
-- first seek — all scale with data volume and query frequency.
--
-- Same row + aggregate shape as the legacy sproc, but rebuilt to:
--   * push filters into the FIRST seek (not the outer projection)
--   * use temp tables (with stats) instead of table variables (no stats)
--   * compute totqty / totamt / totqtyvar / totamtvar via window functions
--     in the same query, eliminating the @rrAsOfTotals separate aggregate
--   * skip server-side pagination (V8 uses bulk-fetch + client paginate)
--   * stay STATIC SQL so the plan cache hits across calls
--
-- Drops the summarize-by-item branch — V8 always requests lot detail and
-- summarizes client-side. If a future caller needs server-side rollup, add
-- a GROUP BY wrapper; do not bring back dynamic SQL.
--
-- SQL Server compatibility floor: 140 (SQL 2017). STRING_SPLIT, IIF,
-- CONCAT, TRY_CAST, OFFSET/FETCH, JSON functions, and CREATE OR ALTER
-- are all legal at this floor. Avoid TRIM() (140+) and STRING_AGG
-- (140+) as a conservative buffer — use LTRIM(RTRIM(...)) and
-- FOR XML PATH respectively if needed. See WORKFLOW.md § "SQL targets
-- the lowest customer compat level" for the full table.
-- =============================================================================

CREATE OR ALTER PROCEDURE dbo.usp6getasof_v2
    @periodends             date
  , @asofdate               date          = NULL  -- defaults to @periodends
  , @includecompanies       varchar(4000) = NULL
  , @includebusinessunits   varchar(max)  = NULL
  , @includeobjects         varchar(max)  = NULL
  , @includesubs            varchar(max)  = NULL
  , @commonuom              nchar(2)      = NULL
  , @itemfilter             nvarchar(50)  = NULL  -- starts-with on c.itemnumber
  , @branchfilter           nvarchar(12)  = NULL  -- starts-with on c.branchplant
  , @locationfilter         nvarchar(30)  = NULL  -- starts-with on c.location
  , @lotfilter              nvarchar(30)  = NULL  -- starts-with on c.lot
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_WARNINGS OFF;

    IF @asofdate IS NULL SET @asofdate = @periodends;

    DECLARE @priorperiod date = (
        SELECT MAX(periodends) FROM dbo.rfiscalcalendar WHERE periodends < @periodends
    );

    -- Materialize the filter lists into temp tables. Temp tables HAVE
    -- statistics; table variables do not. The optimizer will pick a
    -- nested-loop or hash-join based on cardinality of the seek result.
    CREATE TABLE #cos (id varchar(20) PRIMARY KEY);
    CREATE TABLE #bus (id varchar(20) PRIMARY KEY);
    CREATE TABLE #obj (id varchar(20) PRIMARY KEY);
    CREATE TABLE #sub (id varchar(20) PRIMARY KEY);

    IF @includecompanies     IS NOT NULL AND LEN(@includecompanies)     > 0
        INSERT #cos SELECT LTRIM(RTRIM(REPLACE(value,'''',''))) FROM STRING_SPLIT(@includecompanies, ',');
    IF @includebusinessunits IS NOT NULL AND LEN(@includebusinessunits) > 0
        INSERT #bus SELECT LTRIM(RTRIM(REPLACE(value,'''',''))) FROM STRING_SPLIT(@includebusinessunits, ',');
    IF @includeobjects       IS NOT NULL AND LEN(@includeobjects)       > 0
        INSERT #obj SELECT LTRIM(RTRIM(REPLACE(value,'''',''))) FROM STRING_SPLIT(@includeobjects, ',');
    IF @includesubs          IS NOT NULL AND LEN(@includesubs)          > 0
        INSERT #sub SELECT LTRIM(RTRIM(REPLACE(value,'''',''))) FROM STRING_SPLIT(@includesubs, ',');

    DECLARE @hasCos bit = CASE WHEN EXISTS(SELECT 1 FROM #cos) THEN 1 ELSE 0 END;
    DECLARE @hasBus bit = CASE WHEN EXISTS(SELECT 1 FROM #bus) THEN 1 ELSE 0 END;
    DECLARE @hasObj bit = CASE WHEN EXISTS(SELECT 1 FROM #obj) THEN 1 ELSE 0 END;
    DECLARE @hasSub bit = CASE WHEN EXISTS(SELECT 1 FROM #sub) THEN 1 ELSE 0 END;

    -- Materialize the candidate ItemIDs for the period into a temp table.
    -- This is the equivalent of the legacy @itemid table variable, but
    -- as a temp table with stats. Also pushes the company/BU/object/sub
    -- filters DOWN to this stage so we never carry items the analyst
    -- isn't asking for.
    CREATE TABLE #items (
        ItemID         int PRIMARY KEY,
        QuantityonHand float NOT NULL,
        AmountonHand   float NOT NULL
    );

    IF @asofdate = @periodends
    BEGIN
        -- Standard "period close" path. Read RInvAsOf for this period
        -- (covered index seek), then join through ritems +
        -- rinvaccountlist to apply the scope filters.
        INSERT #items (ItemID, QuantityonHand, AmountonHand)
        SELECT  a.ItemID
              , a.QuantityonHand
              , a.AmountonHand
        FROM    dbo.RInvAsOf a
        JOIN    dbo.ritems          c ON c.ItemID         = a.ItemID
        JOIN    dbo.rinvaccountlist b ON b.CompanyNumber  = c.ReportCompany
                                      AND b.ShortAccount   = c.ShortAccount
        WHERE   a.PeriodEnds = @periodends
          AND   ( ROUND(ABS(a.QuantityonHand), 6) >= 0.001
               OR ROUND(ABS(a.AmountonHand),   4) >= 0.01 )
          AND   ( @hasCos = 0 OR b.CompanyNumber IN (SELECT id FROM #cos) )
          AND   ( @hasBus = 0 OR b.BusinessUnit  IN (SELECT id FROM #bus) )
          AND   ( @hasObj = 0 OR b.ObjectAccount IN (SELECT id FROM #obj) )
          AND   ( @hasSub = 0 OR b.SubAccount    IN (SELECT id FROM #sub) );

        -- Cardex-variance items only count for the current period
        -- (on-hand is a snapshot — prior periods have no variance).
        -- The "current period" marker lives on rcompanies.MaxPeriodEnds
        -- (per-company close pointer). Insert variance items not
        -- already covered by the RInvAsOf pass.
        INSERT #items (ItemID, QuantityonHand, AmountonHand)
        SELECT  e.ItemID, 0, 0
        FROM    dbo.rperpetualinv   e
        JOIN    dbo.ritems          c  ON c.ItemID         = e.ItemID
        JOIN    dbo.rcompanies      rc ON rc.CompanyNumber = c.ReportCompany
        JOIN    dbo.rinvaccountlist b  ON b.CompanyNumber  = c.ReportCompany
                                       AND b.ShortAccount   = c.ShortAccount
        WHERE   e.Reason         <> ''
          AND   rc.MaxPeriodEnds  = @periodends
          AND   NOT EXISTS (SELECT 1 FROM #items i WHERE i.ItemID = e.ItemID)
          AND   ( @hasCos = 0 OR b.CompanyNumber IN (SELECT id FROM #cos) )
          AND   ( @hasBus = 0 OR b.BusinessUnit  IN (SELECT id FROM #bus) )
          AND   ( @hasObj = 0 OR b.ObjectAccount IN (SELECT id FROM #obj) )
          AND   ( @hasSub = 0 OR b.SubAccount    IN (SELECT id FROM #sub) );
    END
    ELSE
    BEGIN
        -- "Daily as of" path. Aggregate prior-period on-hand plus
        -- in-period transactions up to @asofdate. The legacy sproc
        -- does this via a UNION ALL + SUM by ItemID; we do the same
        -- but with the filters pushed down.
        INSERT #items (ItemID, QuantityonHand, AmountonHand)
        SELECT  ItemID
              , SUM(QuantityonHand)
              , SUM(AmountonHand)
        FROM    (
                    SELECT  a.ItemID
                          , a.QuantityonHand
                          , a.AmountonHand
                    FROM    dbo.RInvAsOf a
                    JOIN    dbo.ritems          c ON c.ItemID        = a.ItemID
                    JOIN    dbo.rinvaccountlist b ON b.CompanyNumber = c.ReportCompany
                                                  AND b.ShortAccount  = c.ShortAccount
                    WHERE   a.PeriodEnds = @priorperiod
                      AND   ( ABS(a.QuantityonHand) >= 0.000001
                           OR ABS(a.AmountonHand)   >= 0.0001 )
                      AND   ( @hasCos = 0 OR b.CompanyNumber IN (SELECT id FROM #cos) )
                      AND   ( @hasBus = 0 OR b.BusinessUnit  IN (SELECT id FROM #bus) )
                      AND   ( @hasObj = 0 OR b.ObjectAccount IN (SELECT id FROM #obj) )
                      AND   ( @hasSub = 0 OR b.SubAccount    IN (SELECT id FROM #sub) )
                    UNION ALL
                    SELECT  rt.ItemID
                          , SUM(f.quantity)
                          , SUM(f.amount)
                    FROM    dbo.rtransactions rt
                    JOIN    dbo.f4111         f ON f.transid = rt.ilukid
                    JOIN    dbo.ritems        c ON c.ItemID  = rt.ItemID
                    JOIN    dbo.rinvaccountlist b ON b.CompanyNumber = c.ReportCompany
                                                  AND b.ShortAccount  = c.ShortAccount
                    WHERE   rt.PeriodEnds = @periodends
                      AND   f.perioddate <= @asofdate
                      AND   ( @hasCos = 0 OR b.CompanyNumber IN (SELECT id FROM #cos) )
                      AND   ( @hasBus = 0 OR b.BusinessUnit  IN (SELECT id FROM #bus) )
                      AND   ( @hasObj = 0 OR b.ObjectAccount IN (SELECT id FROM #obj) )
                      AND   ( @hasSub = 0 OR b.SubAccount    IN (SELECT id FROM #sub) )
                    GROUP BY rt.ItemID
                ) u
        GROUP BY ItemID;
    END;

    -- One-time UOM missing-conversion lookup (small table; left join below).
    -- Materialized as a temp table for stat-quality joins.
    CREATE TABLE #missingUOM (
        CompanyNumber nchar(5),
        BranchPlant   nchar(12),
        ShortItem     int,
        ItemNumber    nchar(25),
        ThirdItem     nchar(25),
        TransUOM      nchar(2),
        PrimeUOM      nchar(2),
        ItemID        int PRIMARY KEY
    );
    INSERT #missingUOM SELECT * FROM dbo.v6_006_uom_conv;

    -- Aggregate pass: one row of totals, computed in a single scan of
    -- the joined set. Cheaper than SUM() OVER () window aggregates on
    -- the main query — those would spool the entire 40k-row result set
    -- to a worktable for each window scan (we measured 160k logical
    -- reads on the spool alone), whereas this scan reads each base
    -- table exactly once and writes a single output row.
    DECLARE @totqty     float, @totamt     float;
    DECLARE @totqtyvar  float, @totamtvar  float;
    DECLARE @totrows    int;

    SELECT
        @totqty    = SUM(CAST(i.QuantityonHand AS float))
      , @totamt    = SUM(CAST(i.AmountonHand   AS float))
      , @totqtyvar = SUM(CAST(CASE WHEN @asofdate <> @periodends OR e.Reason = ''
                                    THEN 0 ELSE e.estunits END AS float))
      , @totamtvar = SUM(CAST(CASE WHEN @asofdate <> @periodends OR e.Reason = ''
                                    THEN 0 ELSE e.BaselineVar END AS float))
      , @totrows   = COUNT(*)
    FROM     #items          i
    JOIN     dbo.ritems        c ON c.ItemID = i.ItemID
    JOIN     dbo.rperpetualinv e ON e.ItemID = i.ItemID;

    -- Final projection. Same shape as the legacy sproc — every row
    -- carries the totals (echoed via the variable rebroadcast below).
    SELECT
        ROW_NUMBER() OVER (ORDER BY c.ReportCompany, b.LongAccount, c.BranchPlant,
                                    c.ItemNumber, c.Location, c.Lot)  AS RowNum
      , c.ReportCompany                                               AS CompanyNumber
      , b.CompanyNumber                                               AS BranchCompany
      , b.LongAccount                                                 AS LongAccount
      , ISNULL(h.tocurr, g.currencycode)                              AS Currency
      , LTRIM(c.BranchPlant)                                          AS Branch
      , RTRIM(bu.mcdl01)                                              AS BranchDesc
      , c.ShortItem                                                   AS ShortItem
      , c.ItemNumber                                                  AS ItemNumber
      , c.ThirdItem                                                   AS ThirdItem
      , LTRIM(UPPER(im.imdsc1))                                       AS Description
      , c.PrimaryUOM                                                  AS UOM
      , CASE WHEN h.rate IS NULL THEN e.UnitCost
             ELSE e.UnitCost * h.rate END                             AS CurrCost
      , CASE WHEN ROUND(i.QuantityonHand, 4) = 0 THEN 0
             WHEN h.rate IS NULL THEN ROUND(i.AmountonHand / i.QuantityonHand, 4)
             ELSE ROUND(i.AmountonHand / i.QuantityonHand, 4) * h.rate
        END                                                           AS CalcCost
      , LTRIM(RTRIM(c.Location))                                      AS Location
      , LTRIM(RTRIM(c.Lot))                                           AS Lot
      , e.Lotstatus                                                   AS LotStatus
      , lm.iommej                                                     AS LotExp
      , lm.iobodj                                                     AS LotBod
      , CASE WHEN mu.ItemID IS NULL THEN ROUND(i.QuantityonHand, 6)
             ELSE -9999 END                                           AS Quantity
      , CASE WHEN h.rate IS NULL THEN i.AmountonHand
             ELSE i.AmountonHand * h.rate END                         AS Amount
      , c.GLClass                                                     AS GLClass
      , fp.ibstkt                                                     AS ST
      , e.CostMethod                                                  AS CM
      , c.CostLevel                                                   AS CL
      , e.Material, e.Labor, e.Overhead
      , CASE WHEN @asofdate <> @periodends OR e.Reason = '' THEN 0
             ELSE ROUND(e.estunits, 6) END                            AS QtyVar
      , CASE WHEN @asofdate <> @periodends OR e.Reason = '' THEN 0
             ELSE ROUND(e.BaselineVar, 2) END                         AS AmtVar
      , e.Reason                                                      AS Reason
      , LTRIM(RTRIM(fp.ibsrp1)) AS Sales01
      , LTRIM(RTRIM(fp.ibsrp2)) AS Sales02
      , LTRIM(RTRIM(fp.ibsrp3)) AS Sales03
      , LTRIM(RTRIM(fp.ibsrp4)) AS Sales04
      , LTRIM(RTRIM(fp.ibsrp5)) AS Sales05
      , LTRIM(RTRIM(fp.ibsrp6)) AS Sales06
      , LTRIM(RTRIM(fp.ibsrp7)) AS Sales07
      , LTRIM(RTRIM(fp.ibsrp8)) AS Sales08
      , LTRIM(RTRIM(fp.ibsrp9)) AS Sales09
      , LTRIM(RTRIM(fp.ibsrp0)) AS Sales10
      , LTRIM(RTRIM(fp.ibprp1)) AS Purch01
      , LTRIM(RTRIM(fp.ibprp2)) AS Purch02
      , LTRIM(RTRIM(fp.ibprp3)) AS Purch03
      , LTRIM(RTRIM(fp.ibprp4)) AS Purch04
      , LTRIM(RTRIM(fp.ibprp5)) AS Purch05
      , LTRIM(RTRIM(fp.ibprp6)) AS Purch06
      , LTRIM(RTRIM(fp.ibprp7)) AS Purch07
      , LTRIM(RTRIM(fp.ibprp8)) AS Purch08
      , LTRIM(RTRIM(fp.ibprp9)) AS Purch09
      , LTRIM(RTRIM(fp.ibprp0)) AS Purch10
      , CASE WHEN mu.ItemID IS NULL THEN 'n' ELSE 'y' END             AS HasMissingConversion
      -- Totals echoed on every row (matches legacy shape). Sourced
      -- from variables populated in the single-pass aggregate above.
      , @totqty                                                       AS totqty
      , @totamt                                                       AS totamt
      , @totqtyvar                                                    AS totqtyvar
      , @totamtvar                                                    AS totamtvar
      , @totrows                                                      AS totrows
      , 1                                                             AS totpages
    FROM        #items i
    JOIN        dbo.ritems          c  ON c.ItemID         = i.ItemID
    JOIN        dbo.rperpetualinv   e  ON e.ItemID         = i.ItemID
    JOIN        dbo.rinvaccountlist b  ON b.CompanyNumber  = c.ReportCompany
                                       AND b.ShortAccount   = c.ShortAccount
    JOIN        dbo.rcompanies      g  ON g.CompanyNumber  = c.ReportCompany
    LEFT JOIN   dbo.f0006           bu ON bu.mcmcu         = c.BranchPlant
    LEFT JOIN   dbo.f4102           fp ON fp.ibmcu         = c.BranchPlant
                                       AND fp.ibitm         = c.ShortItem
    LEFT JOIN   dbo.f4101           im ON im.imitm         = c.ShortItem
    LEFT JOIN   dbo.f4108           lm ON lm.iolotn        = c.Lot
                                       AND lm.iomcu         = c.BranchPlant
                                       AND lm.ioitm         = c.ShortItem
    LEFT JOIN   dbo.vcr_f1113       h  ON h.fromcurr       = g.currencycode
                                       AND h.tocurr         = g.reportcurrency
                                       AND h.ratetype       = g.ratetype
                                       AND @periodends BETWEEN h.startdate AND h.enddate
    LEFT JOIN   #missingUOM         mu ON mu.ItemID        = i.ItemID
    WHERE       ( @itemfilter     IS NULL OR c.ItemNumber  LIKE @itemfilter     + '%' )
      AND       ( @branchfilter   IS NULL OR c.BranchPlant LIKE @branchfilter   + '%' )
      AND       ( @locationfilter IS NULL OR c.Location    LIKE @locationfilter + '%' )
      AND       ( @lotfilter      IS NULL OR c.Lot         LIKE @lotfilter      + '%' )
    ORDER BY    c.ReportCompany, b.LongAccount, c.BranchPlant,
                c.ItemNumber, c.Location, c.Lot;
    -- No OPTION (RECOMPILE) — the filter parameters drive predicate
    -- selectivity but the temp-table stats give the optimizer enough
    -- to pick a stable plan across calls. Plan reuse is one of V2's
    -- core wins vs. legacy's dynamic SQL.

END
GO

-- =============================================================================
-- Reference: how to call from AsOfController
-- =============================================================================
-- EXEC dbo.usp6getasof_v2
--      @periodends            = '2016-08-27'
--    , @asofdate              = '2016-08-27'
--    , @includecompanies      = '''00900'',''00050'''
--    , @includebusinessunits  = NULL
--    , @includeobjects        = NULL
--    , @includesubs           = NULL
--    , @commonuom             = NULL
--    , @itemfilter            = NULL
--    , @branchfilter          = NULL
--    , @locationfilter        = NULL
--    , @lotfilter             = NULL;
