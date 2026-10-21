-- Archive capture (sp_helptext style) of the live dbo.v6ui_itemrollintegritydialog.
-- Source of truth is RapidReconciler-DB/RapidReconciler/dbo/Views/. Kept here for
-- reference; refreshed 2026-06-06 when LastActivity / TxCount / QtyOnHand / CostLevel
-- were un-lumped out of the V7 "Comment" cell for the V8 cardex modal.
CREATE VIEW [dbo].[v6ui_itemrollintegritydialog]
AS
WITH TransactionSummary AS (
    SELECT
        itemid,
        COUNT(*) AS recs,
        MAX(CreationDate) AS MaxCreationDate
    FROM rtransactions
    where datediff(day, creationdate, getdate()) > 1
    GROUP BY itemid
)
,
ResetDate1 AS (
    select min(insertdate) resetdate from rtransactions
)
-- Header Row (Reset Date)
SELECT
    'Reset:' AS Reason,
    '00000' AS CompanyNumber,
    '' AS LongAccount,
    '' AS Branch,
    '' AS ShortItem,
    CAST(CONVERT(NCHAR(8), resetdate, 1) AS NVARCHAR(30)) AS ItemNumber,
    '' AS ThirdItem,
    '' AS Location,
    '' AS Lot,
    '' AS Method,
    0 AS AdjAmount,
    0 AS AdjQty,
    '' AS UOM,
    '' AS GLClass,
    'Variance from Reset date forward' AS Comment,
    '' AS LastActivity,
    0 AS TxCount,
    0 AS QtyOnHand,
    '' AS CostLevel
FROM resetdate1

UNION ALL

-- Data Rows
SELECT
    CAST(RTRIM(a.reason) AS NVARCHAR(25)) AS Reason,
    CAST(b.reportcompany AS NVARCHAR(5)) AS CompanyNumber,
    CAST(longaccount AS NVARCHAR(30)) AS LongAccount,
    LTRIM(b.branchplant) AS Branch,
    b.shortitem AS ShortItem,
    b.itemnumber AS ItemNumber,
    b.thirditem AS ThirdItem,
    location AS Location,
    lot AS Lot,
    costmethod AS Method,
    CAST(SUM(ROUND(baselinevar, 2)) AS MONEY) AS AdjAmount,
    SUM(ROUND(estunits, 2)) AS AdjQty,
    unitofmeasure AS UOM,
    b.glclass AS GLClass,
    CASE
        WHEN d.branchplant IS NOT NULL THEN ' Check Integrity 4'
        ELSE
            'Date: '   + CONVERT(NCHAR(8), tr.MaxCreationDate, 1) +
            ' | Count: ' + STR(tr.recs, 8, 0) +
            ' | QOH: '   + STR(quantityonhand, 10, 0)
    END AS Comment,
    -- Un-lumped from Comment for V8 (V7 fixed-column limitation removed):
    CONVERT(NVARCHAR(10), tr.MaxCreationDate, 101) AS LastActivity,
    tr.recs AS TxCount,
    quantityonhand AS QtyOnHand,
    -- Item cost level from ritems (already joined) — contributor for rule review:
    CAST(b.costlevel AS NVARCHAR(5)) AS CostLevel
FROM rperpetualinv a
INNER JOIN ritems b ON a.itemid = b.itemid
INNER JOIN rinvaccountlist c ON b.shortaccount = c.shortaccount
INNER JOIN TransactionSummary tr ON a.itemid = tr.itemid
LEFT JOIN v_integrity4_uom_conv d ON b.branchplant = d.branchplant
                                 AND b.shortitem = d.shortitem
WHERE a.reason <> ''

GROUP BY
    a.reason, b.reportcompany, longaccount, b.branchplant, b.shortitem,
    b.itemnumber, b.thirditem, location, lot, costmethod, unitofmeasure,
    b.glclass, b.costlevel, d.branchplant, tr.recs, tr.MaxCreationDate, quantityonhand
