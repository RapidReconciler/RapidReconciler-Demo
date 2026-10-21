-- update view to use new table  
CREATE View   [dbo].[v6ui_unposted_batches]          -- Rec Tab.         Click on batch indicator  
            -- with encryption  
            as  
   -- build 170  
            select      a.companynumber                                                     as CompanyNumber  
            ,           cast(isnull(batchdate,'1901-01-01') as date)                        as BatchDate  
            ,           a.periodends                                                        as PeriodEnds  
            ,           username                                                            as Username  
            ,           longaccount                                                         as LongAccount  
            ,           batchnumber                                                         as BatchNumber  
            ,           type                                                                as Type  
            , case when rate is null then round(amount,2) else round(amount * rate,2) end   as Amount  
            ,           isnull(tocurr, currencycode)                                        as Currency  
            ,           isnull(rate,1)                                                      as Rate  
            ,           apprsts                                                             as Approval_Status  
            ,           poststs                                                             as Posting_Status  
   -- select *  
            from        runpostedbatches a  
            join        ( select companynumber, currencycode, reportcurrency, ratetype from rcompanies) c  
            on          a.companynumber = c.companynumber  
            left join   vcr_f1113 d  
            on          c.currencycode = d.fromcurr  
            and         c.reportcurrency = d.tocurr  
            and         c.ratetype = d.ratetype  
            and         a.periodends between d.startdate and d.enddate  
