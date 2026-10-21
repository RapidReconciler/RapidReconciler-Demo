  
 CREATE Procedure    usp6getfilteredview         -- changed sorting for cardex variance pop up  
            ( @companynumber                nvarchar    (5)                                 = ''  
            , @accountnumber                nvarchar    (28)                                = ''  
            , @businessunit                 nvarchar    (12)                                = ''  
            , @periodends                   datetime                                        = null  
            , @excludecompanies             nvarchar    (255)                               = null  
            , @includecompanies             nvarchar    (4000)                              = null  
            , @includebusinessunits         varchar     (max)                               = null  
            , @includeobjects               varchar     (max)        = null  
            , @includesubs                  varchar     (max)        = null  
            , @viewname                     nvarchar    (30)                                = null  
            , @table                        nchar       (30)                                = null  
            , @reasoncode                   nchar       (3)                                 = null  
            , @commonuom                    nchar       (2)                                 = null  
            , @summarizebyitem              nchar       (1)                                 = 'N'  
            , @useperiodendsle              bit                                             = 0  
            , @withnotes                    bit                                             = 0  
            , @returnrows                   bit                                             = 0  
            , @debug                        bit                                             = 0  
   , @worked      nchar(1)          = 'N'  
   , @page       int            = 1  
   , @recsperpage     dec(18,3)          = 250  
   , @columnfilters    varchar(max)         = null )  
            -- with encryption  
            as  
            set nocount on  
            -- *****************************************************************************************  
            declare     @sql                varchar     (max)                               = ''  
            declare     @where              varchar     (max)                               = ''  
            declare     @peop               nvarchar    (2)  
   declare  @firstrec   int  
   declare  @lastrec   int  
   declare  @cardexperiod  date           = @periodends      -- to support cross periods view  
  
   select  @firstrec = (@page - 1) * @recsperpage + 1  
   select  @lastrec = (@page * @recsperpage)  
            -- *****************************************************************************************  
            set         @includebusinessunits = replace(@includebusinessunits, ' ','')  
            if          @useperiodendsle    = 0   
            begin       set @peop           = '='   end  
            else begin  set @peop           = '<='  end  
            if          @table is not null    
            begin       set @viewname = @table      end  
  
            --          reconciliation tab  
            if          @viewname           = 'getperiodendclose'                                                               -- support for period end close               
                        begin set           @sql = @sql + 'select * from v6ui_getperiodendclose' goto skip end  
            if          @viewname           = 'v6ui_getcompanies'                                                               -- support for company filter  
                        begin set           @sql = @sql + 'select * from v6ui_getcompanies order by companynumber' goto skip end  
            if          @viewname           = 'v6ui_getbusinessunits'                                                           -- support for business unit filter  
                        begin  
           set         @periodends = null  
                        set         @includebusinessunits = null  
                        set         @includeobjects = null  
                        set         @includesubs = null  
                        set         @sql = @sql + 'select * from v6ui_getbusinessunits b'  
                        goto        filteredwhere  
                        end  
            if          @viewname           = 'v6ui_getobjects'                                                                 -- support for object account cascading  
                        begin  
                        set         @periodends = null  
                        set         @includeobjects = null  
                        set         @includesubs = null  
                        set         @sql = @sql +   '  
                        select distinct objectaccount                                               as ObjectAccount  
                        , case when charindex('' - '',name) > 0 then rtrim(substring(name,0, charindex('' - '',name)))  
                        else        name end                                                            as Name  
                        from        (select objectaccount, max(name) name from v6ui_getobjects b   
                        '  
                        goto        filteredwhere  
                        end  
            if          @viewname           = 'v6ui_getsubs'                                                                    -- support for sub account cascading  
                        begin  
                        set         @periodends = null  
                        set         @includesubs = null  
                        set         @sql = @sql +   '  
                        select      distinct rtrim(subaccount)                                          as Subaccount  
                        , case when charindex('' -  '',accountdescription) > 0  
                        then        right(accountdescription,charindex('' - '', reverse(accountdescription))-1)  
                        else        ''''  
                        end                                                                             as Name  
                        from        (select * from v6ui_getsubs b  
                        cross apply dbo.ufn_trimstring(b.businessunit, b.objectaccount, b.subaccount)'  
                        goto        filteredwhere  
                        end  
            if          @viewname           = 'getoutofbalance'                                                                 -- support for out of balance history graph  
                        begin  
                        set         @sql = @sql +   '  
                        select      top 100 percent periodends                                          as PeriodEnds  
                        ,           cast(round(sum(amount),2) as decimal(18,2))                         as [Out Of Balance]  
                        from        (select a.periodends  
                        ,           a.companynumber  
                        ,           a.businessunit  
                        ,           a.objectaccount  
                        ,           a.subaccount  
      ,           ltrim(rtrim(a.businessunit)) trimbu  
                        ,           ltrim(rtrim(a.objectaccount)) trimobj  
                        ,           ltrim(rtrim(a.subaccount)) trimsub  
                        , case when rate is null   
                        then        round(sum(outofbalance),2)  
                        else        round(sum(outofbalance) * rate,2)   
                        end                                                                             as Amount                     
                        from        raccountsummary a  
                        join        v6ui_getcompanies c  
                        on          a.companynumber = c.companynumber  
                        left join   vcr_f1113 d   
              on          c.currencycode = d.fromcurr  
                        and         c.reportcurrency = d.tocurr  
                        and         c.ratetype = d.ratetype  
                        and         a.periodends between d.startdate and d.enddate  
                        group by    a.periodends  
                        ,           a.companynumber  
                        ,           a.businessunit  
                        ,           a.objectaccount  
                        ,           a.subaccount  
                        ,           rate) b  
                        -- cross apply dbo.ufn_trimstring(b.businessunit, b.objectaccount, b.subaccount)  
      '  
                        goto        filteredwhere  
                        end  
            if          @viewname           = 'rinvsummary'                                                                     -- support for worksheet data  
                        begin  
                        set @sql = @sql + '  
                        select      isnull(round(sum(beginningbalance),2),0)                            as BegBal  
                        ,           isnull(round(sum(ledgeramount),2),0)                                as PerGL  
                        ,           isnull(round(sum(endingglbalance),2),0)                             as EndGLBal  
                        ,           isnull(round(sum(unpostedbatchamount),2) * -1 ,0)                   as UnpstGL  
                        ,           isnull(round(sum(amountonhand),2),0)                                as Perpetual  
                        ,           isnull(round(sum(accountvariance),2),0)                             as BegVar  
                        ,           isnull(round(sum(endofday),2)   * -1 ,0)                            as EndofDay  
                        ,           isnull(round(sum(transactionvariance),2) * -1,0)                    as Variance  
                        ,           isnull(round(sum(journalentries),2),0)                              as JEs  
                        ,           isnull(round(sum(outofbalance),2),0)                                as OutOfBal  
                        ,           isnull(round(sum(balcxvar),2),0)                                    as ItemRoll  
                        from        (select a.periodends                                                as PeriodEnds     
                        ,           a.shortaccount                                                      as ShortAccount  
                        ,           a.companynumber                                                     as CompanyNumber      
                        , case when rate is null then round(sum(beginningbalance),2)  
                        else                          round(sum(beginningbalance * rate),2)         end as beginningbalance  
                        , case when rate is null then round(sum(ledgeramount),2)  
                        else                          round(sum(ledgeramount * rate),2)             end as ledgeramount  
                        , case when rate is null then round(sum(endingglbalance),2)  
                        else                          round(sum(endingglbalance * rate),2)          end as endingglbalance  
                        , case when rate is null then round(sum(unpostedbatchamount),2)  
                        else                          round(sum(unpostedbatchamount * rate),2)      end as unpostedbatchamount  
                        , case when rate is null then round(sum(amountonhand),2)  
                        else                          round(sum(amountonhand * rate),2)             end as amountonhand  
                        , case when rate is null then round(sum(accountvariance),2)  
                        else                          round(sum(accountvariance * rate),2)          end as accountvariance  
                        , case when rate is null then round(sum(endofday),2)  
                        else                          round(sum(endofday * rate),2)                 end as endofday  
                        , case when rate is null then round(sum(transactionvariance),2)  
                        else                          round(sum(transactionvariance * rate),2)      end as transactionvariance  
                        , case when rate is null then round(sum(journalentries),2)  
                        else                          round(sum(journalentries * rate),2)           end as journalentries  
                        , case when rate is null then round(sum(outofbalance),2)  
                        else                          round(sum(outofbalance * rate),2)             end as outofbalance  
                        , case when rate is null then round(sum(balcxvar),2)  
                        else                          round(sum(balcxvar * rate),2)                 end as balcxvar  
                        from        raccountsummary a  
                        join        v6ui_getcompanies c  
                        on          a.companynumber = c.companynumber  
                        left join   vcr_f1113 d   
                        on          c.currencycode = d.fromcurr  
                        and         c.reportcurrency = d.tocurr  
                        and         c.ratetype = d.ratetype  
                        and         a.periodends between d.startdate and d.enddate  
      where       a.shortaccount not in (''xxxxxxxx'', ''yyyyyyyy'')  
                        group by    a.periodends  
                        ,           a.companynumber  
                        ,           a.shortaccount  
                        ,           rate) a  
                        join        rinvaccountlist b  
                        on          a.shortaccount = b.shortaccount'  
                        goto        filteredwhere  
                        end  
            if          @viewname           = 'v6ui_suggested_entry'                                                            -- support for journal entry button  
                        begin         
                        set         @includecompanies = null  
                        end  
  
-- 10/17 - Added pagination logic  
            if          @viewname           = 'perpetualinv'                                                                    -- inventory tab  
                        begin  
                        set         @sql = @sql +   '  
      WITH TempResult as( '  
      if          @summarizebyitem = 'Y'  
                        begin  
                        set         @sql = @sql + '  
      select  ROW_NUMBER() OVER(ORDER BY c.companynumber, longaccount, c.branchplant, c.itemnumber) as RowNum '  
      end  
      if          @summarizebyitem = 'N'  
                        begin  
      set         @sql = @sql + '  
      select  ROW_NUMBER() OVER(ORDER BY c.companynumber, longaccount, c.branchplant, c.itemnumber, c.location, c.lot) as RowNum '  
      end  
                        set         @sql = @sql + '  
                        ,   c.reportcompany                   as CompanyNumber  
                        ,           c.companynumber                   as BranchCompany  
                        ,           longaccount                    as LongAccount  
                        ,           isnull(tocurr,currencycode)                as Currency   
                        ,           ltrim(c.branchplant)                 as Branch  
      ,   rtrim(mcdl01)                   as [BranchDesc]  
                        ,           c.shortitem                    as ShortItem  
                        ,           c.itemnumber                   as ItemNumber  
                        ,           c.thirditem                    as ThirdItem  
                        ,           ltrim(upper(imdsc1))                 as Description  
                        ,           primaryuom                    as UOM  
                        , case  when rate is null then e.unitcost else e.unitcost * rate end       as CurrCost  
      '  
      if          @summarizebyitem = 'N'  
                        begin  
                        set         @sql = @sql + '  
      , case  when rate is null then case when round(a.quantityonhand, 4) = 0 then 0 else round(a.amountonhand/(a.quantityonhand),4) end  
      else case when round(a.quantityonhand, 4) = 0 then 0 else round(a.amountonhand/(a.quantityonhand),4) * rate end end as CalcCost  
                        '  
      end  
      if          @summarizebyitem = 'Y'  
                        begin  
                        set         @sql = @sql + '  
      , case  when rate is null then case when round(sum(a.quantityonhand), 4) = 0 then 0 else round(sum(a.amountonhand)/(sum(a.quantityonhand)),4) end  
      else case when round(sum(a.quantityonhand), 4) = 0 then 0 else round(sum(a.amountonhand)/(sum(a.quantityonhand)),4) * rate end end as CalcCost  
                        '  
      end  
                        if          @summarizebyitem = 'N'  
                        begin  
                        set         @sql = @sql + '  
                        ,           ltrim(rtrim(location))                 as Location  
                        ,           ltrim(rtrim(lot))                  as Lot  
                        ,case when  uom.itemnumber is null then round(a.quantityonhand,6) else -9999 end     as Quantity  
                        ,case when  rate is null then a.amountonhand else a.amountonhand * rate end       as Amount  
                        ,           glclass                     as GLClass  
                        ,           ibstkt                     as ST  
                        ,           e.CostMethod                   as CM  
                        ,           e.Material                    as Material  
                        ,           e.Labor                     as Labor  
                        ,           e.overhead                    as Overhead  
      ,   case when reason = '''' then 0 else round(e.estunits,6) end        as QtyVar  
      ,   case when reason = '''' then 0 else round(e.baselinevar,2) end       as AmtVar  
      ,   reason                     as Reason  
                        ,           ltrim(rtrim(ibsrp1))                 as Sales01  
                        ,           ltrim(rtrim(ibsrp2))                 as Sales02  
                        ,           ltrim(rtrim(ibsrp3))                 as Sales03  
                        ,           ltrim(rtrim(ibsrp4))                 as Sales04  
                        ,           ltrim(rtrim(ibsrp5))                 as Sales05  
                        ,           ltrim(rtrim(ibsrp6))                 as Sales06  
                        ,           ltrim(rtrim(ibsrp7))                 as Sales07  
                        ,           ltrim(rtrim(ibsrp8))                 as Sales08  
                        ,           ltrim(rtrim(ibsrp9))                 as Sales09  
                        ,           ltrim(rtrim(ibsrp0))                 as Sales10  
                        ,           ltrim(rtrim(ibprp1))                 as Purch01  
                        ,           ltrim(rtrim(ibprp2))                 as Purch02  
                        ,           ltrim(rtrim(ibprp3))                 as Purch03  
                        ,           ltrim(rtrim(ibprp4))                 as Purch04  
                        ,           ltrim(rtrim(ibprp5))                 as Purch05  
                        ,           ltrim(rtrim(ibprp6))                 as Purch06  
                        ,           ltrim(rtrim(ibprp7))                 as Purch07  
                        ,           ltrim(rtrim(ibprp8))                 as Purch08  
                        ,           ltrim(rtrim(ibprp9))                 as Purch09  
                        ,           ltrim(rtrim(ibprp0))                 as Purch10  
                        ,case when  uom.itemnumber is null then ''n'' else ''y''      
                        end                         as HasMissingConversion  
                        '  
                        if          @commonuom is not null  
                        begin  
                        set         @sql = @sql + '  
                        ,           isnull(round(confact,6),0)                as Factor  
                        ,           isnull(round(a.quantityonhand*confact,6),0)            as CommonQty  
                        ,           '''+ @commonuom + '''                 as CommonUOM  
                        '  
                        end                                                                                                     -- commonuom  
                        end                                                                                                     -- summarize by item N  
                        if          @summarizebyitem = 'Y'  
                        begin  
                        set         @sql = @sql + '  
                        ,case when  uom.itemnumber is null then round(sum(a.quantityonhand),6) else -9999 end    as QOH  
                        ,case when  rate is null then sum(a.amountonhand) else sum(a.amountonhand) * rate end    as AmountonHand  
      ,case when  uom.itemnumber is not null then -9999   
            when  reason = '''' then 0  
         else  round(sum(estunits),6)  end                as QtyVar  
                        ,case when  reason = '''' then 0  
            when rate is null then sum(baselinevar)   
         else sum(baselinevar) * rate end                as AmtVar  
      ,reason                        as Reason  
                        '  
                        if          @commonuom is not null  
                        begin  
                        set         @sql = @sql + '  
                        ,           isnull(round(max(confact),6),0)               as Factor  
                        ,           isnull(round(sum(a.quantityonhand*confact),6),0)          as CommonQty  
                        ,           '''+ @commonuom + '''                 as CommonUOM  
                        '  
                        end   
                        end                                                                                                     -- summarize by item Y  
                        set         @sql = @sql + '   
                        from        rinvasof     a  
                        join        ritems      c on a.itemid = c.itemid'  
      if          @columnfilters is not null  
                        begin  
                        set         @sql = @sql +  @columnfilters  
      end  
      set   @sql = @sql + '  
                        join        rinvaccountlist    b on b.shortaccount = c.shortaccount  
      join        rperpetualinv    e on a.itemid = e.itemid  
      join        rcompanies     g on c.reportcompany = g.companynumber  
  
      left join   f0006      bu on c.branchplant = mcmcu  
                        left join   f4102      d on c.branchplant = d.ibmcu and c.shortitem = d.ibitm  
                        left join   f4101      im on c.shortitem = im.imitm  
                        left join   v_integrity4_uom_conv  uom on a.itemid = uom.itemid   
                          
                        left join   vcr_f1113     h   
                        on          g.currencycode = h.fromcurr  
                        and         g.reportcurrency = h.tocurr  
                        and         g.ratetype = h.ratetype  
                        and         a.periodends between h.startdate and h.enddate  
                          
                        '  
                        if          @commonuom is not null  
                        begin  
                        set         @sql = @sql + '  
                        left join   rconversions f  
                        on          c.shortitem = f.shortitem  
                        and         c.branchplant = f.branchplant  
                        and         uom = ''' + @commonuom + '''  
                        '  
                        end  
                        goto        filteredwhere  
                        end  
   if   @viewname    = 'v6_inv_trans_offset_summary'  
      begin  
           if @worked != 'A'  
           begin  
           set @sql = @sql + 'select a.companynumber, a.periodends, a.longaccount, je_account, je_amount from v6_inv_trans_offset_summary '   
           end  
           if @worked = 'A'  
           begin  
           set @sql = @sql + 'select a.companynumber, a.periodends, a.longaccount, je_account, sum(je_amount) je_amount from v6_inv_trans_offset_summary '  
           end   
      set     @sql = @sql + ' a join rinvaccountlist b on a.longaccount = b.longaccount'  
      goto  filteredwhere  
      end  
   
   
            if          @table              in ('v_integrity_jde_aais'                                                          -- The filtered where clause is skipped.  
      ,     'v_integrity1_aai_base'  
                        ,                   'v_integrity2_aai_discrp'  
                        ,                   'v_integrity3_exc_glc'  
                        ,                   'v_integrity4_uom_conv'  
                        ,                   'v_integrity5_gl_class'  
                        ,                   'v_integrity6_duplicate_costs'   
                        ,                   'v_integrity7_frozen_cost'  
      ,     'v_integrity8_missing_branch'  
                        ,                   'v_integrity10_duplicate_sales'  
      )  
                        begin   
      set           @sql = 'select * from ' + @table + ' where (companynumber in (' + @includecompanies + ') or companynumber = ''00000'')'  
   
--if @table    in ('v_integrity4_uom_conv', 'v_integrity6_duplicate_costs')   -- commented out to allow filtering by company  
-- begin set           @sql = @sql + 'or companynumber != '''' ' goto skip end  
  
       if   @table    in ('v_integrity10_duplicate_sales') and @periodends is not null  
          begin set   @sql = @sql + ' and periodends  = ' + ''''  +  convert(nvarchar(30), @periodends, 101) + '''' goto skip end  
      goto skip  
      end  
   
   set         @sql = @sql + 'select a.* from ' + @viewname + ' a join rinvaccountlist b on a.longaccount = b.longaccount' -- generic views  
  
   if   @table in ('v_integrity11_crossperiods') and @periodends is not null  
      begin  
      set @periodends = null  
                        end  
  
            filteredwhere:   -- Applies the companies, business units, objects and subs to the query where clause  
                        if          @periodends is not null begin if len(@where) != 0 begin set @where = @where + '   
                        and '       end set @where = @where + '     a.periodends ' + @peop + ' ''' + convert(nvarchar(30), @periodends, 101) + '''' end  
                        if          @includecompanies is not null begin if len(@where) != 0  begin set @where = @where + '   
                        and '       end set @where = @where + '     b.companynumber in (' + @includecompanies + ')' end  
                        if          @includebusinessunits is not null and @includebusinessunits != '' begin if len(@where) != 0  begin set @where = @where + '   
                        and '       end set @where = @where + '     trimbu in (' + @includebusinessunits + ')' end  
                        if          @includeobjects is not null and @includeobjects != '' begin if len(@where) != 0  begin set @where = @where + '   
                        and '       end set @where = @where + '     trimobj in (' + @includeobjects + ')' end  
                        if          @includesubs is not null and @includesubs != '' begin if len(@where) != 0  begin set @where = @where + '   
                        and '       end set @where = @where + '     trimsub in (' + @includesubs + ')' end  
                        if          len(@where) > 0  begin set @sql = @sql + '   
                        where       ' + @where end  
  
   if   @table in ('v_integrity11_crossperiods') and @cardexperiod is not null  
      begin  
                        set @sql = @sql + ' and cardexperiod  = ' + ''''  +  convert(nvarchar(30), @cardexperiod, 101) + ''''  
                        end    
  
            --          closing text for sql statements  
            if          @viewname    = 'v6ui_getobjects'       
                        begin   
                        set @sql = @sql + ' group by objectaccount) objects'   
                        end  
            if          @viewname    = 'v6ui_getsubs'              
                        begin   
                        set @sql = @sql +   ') subs'      
                        end  
            if          @viewname    = 'v6ui_raccountsummary'      
                        begin   
                        set @sql = @sql + '    
                        order by    companynumber  
                        ,           longaccount  
                        ,           periodends'                                                               
                        end  
  
   if          @viewname    = 'v6_inv_trans_offset_summary'      
                        begin  
         if @worked = 'N'  
         begin  
         set @sql = @sql + '   
         and worked = 0   
         '   
         end  
         if @worked = 'Y'  
         begin  
         set @sql = @sql + '   
         and worked = 1   
         '   
         end  
         if @worked = 'A'  
         begin  
         set @sql = @sql + '  
         group by a.companynumber  
         ,  a.periodends  
         ,  a.longaccount  
         ,  je_account  
         '  
         end  
                        set @sql = @sql + '    
                        order by companynumber  
      ,   periodends  
      ,   longaccount  
      ,   je_account  
      '                                                              
                        end  
   if          @viewname    = 'v6_inv_eod_offset_summary'      
                        begin  
      set @sql = @sql + '    
                        order by companynumber  
      ,   periodends  
      ,   longaccount  
      ,   seq  
      ,   je_account  
      '                                                              
                        end  
            if          @viewname    = 'getoutofbalance'       
                        begin   
                        if          len(@where) = 0   
                        begin   
                        set         @sql = @sql + '  
                        where '       
                        end   
                        else   
                        begin   
                        set         @sql = @sql + 'and'   
                        end   
                        set         @sql = @sql +   '  
                        periodends > dateadd(m,-12,'''' + convert(varchar,(select max(periodends) from rfiscalcalendar), 120) + '''')   
                        group by    periodends  
                        order by    periodends'                                                               
                        end  
            if          @viewname    = 'v6ui_reconfiledata'  
                        begin  
                        set         @sql =   
                        case  
                        when        @reasoncode = 'Amo'             then @sql + '  
                        and         reason = ''RRA''   
                        order by    mcu  
                        ,           litm  
                        ,           locn  
                        ,           lotn'  
                        when        @reasoncode = 'Qua'             then @sql + '  
                        and         reason = ''RRQ''   
                        order by    mcu  
                        ,           litm  
                        ,           locn  
                        ,           lotn'  
                        else        @sql + ''  
                        end  
                        end  
            if          @viewname    = 'perpetualinv' and @summarizebyitem = 'N'  
                        begin  
                        set         @sql = @sql +   '  
                        and         (round(abs(a.quantityonhand),4) >= 0.0001  
                        or          round(abs(a.amountonhand),2) >= 0.01  
      or   reason != '''')'  
      if (select @@version) not like '% 2008%'  
      begin  
                        set         @sql = @sql +   '  
      order by rownum offset 0 rows'  
      end  
      set         @sql = @sql +   '  
      )  
  
      select a.*, b.*  
      from(  
      select ceiling(count(*)/ ' + cast(@recsperpage as varchar(10)) + ') as totpages  
      , count(*)               as totrows  
      , round(sum(quantity),6)           as totqty  
      , round(sum(amount),2)            as totamt  
      , round(sum(case when reason = '''' then 0 else qtyvar end),6)  as totqtyvar  
      , round(sum(case when reason = '''' then 0 else amtvar end),2)  as totamtvar  
      from tempresult  
      ) a  
      join(  
      select top 100 percent *   
      from tempresult   
      where rownum between ' + cast(@firstrec as varchar(10)) + ' and ' + cast(@lastrec as varchar(10)) + '   
      order by rownum) b  
      on 1=1  
                        '  
                        end  
            if          @viewname    = 'perpetualinv' and @summarizebyitem = 'Y'  
                        begin  
                        set         @sql = @sql + '  
                        group by    c.reportcompany  
                        ,           c.companynumber           
                        ,           longaccount           
                        ,           c.branchplant  
      ,   mcdl01  
                        ,           c.shortitem  
                        ,           uom.itemnumber            
                        ,           c.itemnumber          
                        ,           c.thirditem           
                        ,           imdsc1            
                        ,           primaryuom            
                        ,           e.unitcost  
                        ,           tocurr  
                        ,           currencycode  
                        ,           rate  
      ,   reason  
      having  (round(abs(sum(a.quantityonhand)),4) >= 0.0001  
                        or          round(abs(sum(a.amountonhand)),2) >= 0.01  
      or   reason != '''')'  
      if (select @@version) not like '% 2008%'  
      begin  
                        set         @sql = @sql +   '  
      order by rownum offset 0 rows'  
      end  
      set         @sql = @sql +   '  
      )  
      select a.*, b.*  
      from(  
      select ceiling(count(*)/ ' + cast(@recsperpage as varchar(10)) + ') as totpages  
      , count(*)               as totrows  
      , round(sum(qoh),6)             as totqty  
      , round(sum(amountonhand),2)          as totamt  
      , round(sum(case when reason = '''' then 0 else qtyvar end),6)  as totqtyvar  
      , round(sum(case when reason = '''' then 0 else amtvar end),2)  as totamtvar  
      from tempresult  
      ) a  
      join(  
      select top 100 percent *   
      from tempresult   
      where rownum between ' + cast(@firstrec as varchar(10)) + ' and ' + cast(@lastrec as varchar(10)) + '   
      order by rownum) b  
      on 1=1  
      '          
                        end  
   if          @viewname    = 'v6ui_getaccounts'  
                        begin  
                        set         @sql = @sql +   '  
                        order by companynumber  
      ,   longaccount  
                        '  
                        end  
   if          @viewname    = 'v6ui_accountsummaryreport'  
                        begin  
                        set         @sql = @sql +   '  
                        order by companynumber  
      ,   longaccount  
                        '  
                        end  
   if          @viewname    = 'v6ui_suggested_entry'  
                        begin  
         set         @sql = @sql +   '  
                        order by companynumber  
      ,   longaccount  
                        '  
                        end  
   if          @viewname    = 'v6ui_getoffsetaccounts'  
                        begin  
                        set         @sql = @sql +   '  
                        order by companynumber  
      ,   varsource  
      ,   doctype  
      ,   ordertype  
      ,   longaccount  
                        '  
                        end  
   if          @viewname    = 'v6ui_itemrollintegritydialog'  
                        begin  
                        set         @sql = @sql +   '  
                        order by companynumber  
      ,   reason desc  
      ,   branch  
      ,   shortitem  
      ,   longaccount  
                        '  
                        end  
            skip:  
  
            if          (@debug = 1)        print isnull(@sql,'null query')  
            exec        (@sql)  
            set         nocount off  
