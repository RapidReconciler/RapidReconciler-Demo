    CREATE View         [dbo].[v6ui_getaccounts]                                                                                        -- Rec Tab.         Click report button  
            -- with encryption  
            as  
            select top 100 percent rinvaccountlist.companynumber                           as CompanyNumber  
            ,           rinvaccountlist.businessunit                                        as BusinessUnit  
            ,           rinvaccountlist.longaccount                                         as LongAccount  
            ,           rinvaccountlist.accountdescription                                  as AccountDescription  
            from        rinvaccountlist  
            where       businessunit != ''  
   order by companynumber  
   ,   longaccount  
