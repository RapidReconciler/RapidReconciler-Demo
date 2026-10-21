  
  
  
    CREATE View         [dbo].[v6ui_unposted_cardex]                                                                                    -- Rec Tab.         Click on End of Day link  
            -- with encryption  
            as  
            select      a.periodends                                                        as PeriodEnds  
            ,           creationdate                                                        as TransactionDate  
            ,           a.companynumber                                                     as CompanyNumber  
            ,           a.longaccount                                                       as LongAccount  
            ,   isnull(oa.offsetaccount, 'TBD')          as OffsetAccount  
            ,           type                                                                as Type  
            ,           a.ordertype                                                         as OrderType  
            ,           a.doctype                                                           as DocType  
            ,           docnumber                                                           as DocNumber  
            ,           branchplant                                                         as BranchPlant  
            ,           status                                                              as Status  
            , case when rate is null then round(amount,2) else round(amount * rate,2) end   as TransactionAmount  
            ,           isnull(tocurr, currencycode)                                        as Currency  
            ,           isnull(rate,1)                                                      as Rate  
            from        runpostedcardex a  
            join        rinvaccountlist al  
            on          a.companynumber = al.companynumber  
            and         a.longaccount = al.longaccount  
            join        v6ui_getcompanies c  
            on          a.companynumber = c.companynumber  
            left join   roffsetaccounts oa  
            on          a.companynumber = oa.companynumber  
            and         al.longaccount = oa.longaccount  
            and         a.doctype = oa.doctype  
            and         a.ordertype = oa.ordertype  
            and         oa.varsource = 'EOD'  
            left join   vcr_f1113 d  
            on          c.currencycode = d.fromcurr  
            and         c.reportcurrency = d.tocurr  
            and         c.ratetype = d.ratetype  
            and         a.periodends between startdate and enddate  
  
  
  
  
  
