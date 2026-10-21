    CREATE View         [dbo].[v6ui_manual_entries]                                                                                     -- Rec Tab.         Click manual journal entry link  
            -- with encryption  
            as  
            select      b.companynumber                                                     as CompanyNumber  
            ,           a.periodends                                                        as PeriodEnds  
            ,           a.doctype                                                           as DocType  
            ,           docnumber                                                           as DocNumber  
            ,           longaccount                                                         as LongAccount  
            , case when rate is null then sum(amount)else sum(amount) * rate end            as Amount  
            ,           isnull(tocurr, currencycode)                                        as Currency  
            ,           isnull(rate,1)                                                      as Rate  
            ,           userid                                                              as UserName  
            ,           originator                                                          as Originator  
            ,           explanation                                                         as Explanation  
            ,           remark                                                              as Remark  
            from        vcr_f0911 a  
            join        rinvaccountlist b  
            on          a.shortaccount = b.shortaccount  
            join        v6ui_getcompanies c  
            on          b.companynumber = c.companynumber  
            left join   vcr_f1113 d  
            on          c.currencycode = d.fromcurr  
            and         c.reportcurrency = d.tocurr  
            and         c.ratetype = d.ratetype  
            and         a.periodends between d.startdate and d.enddate  
            join        (select * from v6_common_jetypes ) je  
            on          je.doctype = a.doctype --rtrim(a.doctype + ordertype)  
            where       batchtype = 'g'   
   and         ordertype = ''  
            group by    b.companynumber  
            ,           longaccount  
            ,           a.periodends  
            ,           a.doctype  
            ,           docnumber  
            ,           userid  
            ,           originator  
            ,           explanation  
            ,           remark  
            ,           currencycode  
            ,           tocurr  
            ,           rate  
            ,           businessunit  
            ,           objectaccount  
            ,           subaccount  
            having      sum(amount) <> 0  
  
  
