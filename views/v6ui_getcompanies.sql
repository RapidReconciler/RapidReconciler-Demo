CREATE View         [dbo].[v6ui_getcompanies]                                                                                       -- company filter, filtered by userid  
            -- with encryption  
            as  
   -- build 170. Remove dashes from company name as they may cause parsing issues on web page  
            select top  100 percent a.companynumber                  as Companynumber  
            ,           convert( nvarchar(8),   periodcutoff, 1 )              as Periodcutoff  
            ,           rtrim(replace(replace(replace(replace(name,'-',''),'&',''),'.',''),',',''))   
      + ' ' + '(' + case when currencycode = '' then 'USD' else isnull(currencycode,'') end  + ')' as PeriodEnds  
            , case when currencycode = '' then 'USD' else isnull(currencycode,'') end         as CurrencyCode  
            , case when currencycode = '' then 'USD' else isnull(currencycode,'') end         as ReportCurrency  
            ,           ratetype                      as RateType  
            from        rcompanies a  
            join        (   
       select distinct companynumber reportcompany   
       from rinvaccountlist   
       union   
       select  distinct reportcompany   
       from v6_004_base_accounts  
      ) b  
            on          a.companynumber = b.reportcompany  
            order by    a.companynumber  
