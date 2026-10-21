CREATE View         [dbo].[v6ui_getbusinessunits]                                                                                   -- business unit filter, filtered by company  
            -- with encryption  
            as  
            select      distinct companynumber                    as CompanyNumber  
            ,           ltrim(rtrim(businessunit))                   as BusinessUnit  
            ,case when  max(businessunitdescription) = ''  
            then        'None'  
            else        max(replace(replace(replace(replace(businessunitdescription,'&',''),'-',''),',',''),'.','')) end as Name  
            ,           ltrim(rtrim(businessunit))                   as TrimBusinessUnit  
            from        rinvaccountlist a  
            where       businessunit != ''  
   group by companynumber  
   ,   businessunit  
