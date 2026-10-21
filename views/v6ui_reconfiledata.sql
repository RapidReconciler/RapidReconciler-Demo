    CREATE View         v6ui_reconfiledata                                                                                      -- Variance Tab.    Click on generate csv button  
            -- with encryption  
            as  
            select  
            case  
            when        reason  = 'amount'  
            then        'RRA'  
            else        'RRQ'  
            end                                                                             as Reason  
            ,           ltrim(branchplant)                                                  as MCU  
            ,           itemnumber                                                          as LITM  
            ,           location                                                            as LOCN  
            ,           lot                                                                 as LOTN  
            ,           ltrim(rtrim(b.companynumber))                                       as CompanyNumber  
            ,           cast(sum(estunits) * -1 as decimal(18,4))                           as QTYADJPR  
            , case  
            when        sum(estunits) <> 0  
            then        0  
            else        cast(sum(baselinevar) * -1 as decimal(18,2))  
            end                                                                             as amtadj  
            ,           0                                                                   as PN  
            ,           getdate()                                                           as [55LBDT]  
            ,           ''                                                                  as EDSP  
            ,           longaccount                                                         as LongAccount  
            from        dbo.rperpetualinv a  
            join        ritems c  
            on          a.itemid = c.itemid  
            and         reason !=   ''  
            join        rinvaccountlist b  
            on          b.shortaccount = c.shortaccount  
            group by    reason  
            ,           branchplant  
            ,           itemnumber  
            ,           location  
            ,           lot  
            ,           b.companynumber  
            ,           longaccount  
