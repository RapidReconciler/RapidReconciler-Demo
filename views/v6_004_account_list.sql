  
  
    CREATE View         [dbo].[v6_004_account_list]  
            -- with encryption  
            as  
            select top 100 percent a.companynumber                                          as CompanyNumber  
            ,                   a.shortaccount                                              as ShortAccount  
            ,                   a.businessunit                                              as BusinessUnit  
            ,                   a.objectaccount                                             as ObjectAccount  
            ,                   a.subaccount                                                as SubAccount  
            ,                   a.longaccount                                               as LongAccount  
            ,                   a.accountdescription                                        as AccountDescription  
            ,                   b.mcdl01                                                    as BusinessUnitDecscription  
            ,                   ccname                                                      as CompanyDescription  
            ,                   cccrcd                                                      as CurrencyCode  
            ,                   a.companynumberacct                                         as CompanyNumberAcct  
            ,                   a.interco                                                   as Interco  
            ,                   a.trimbu                                                    as TrimBU  
            ,                   a.trimobj                                                   as TrimObj  
            ,                   a.trimsub                                                   as TrimSub  
  
            from                (select distinct f.gmco                                     as CompanyNumber  
            ,                   f.gmaid                                                     as ShortAccount  
            ,                   ai.businessunit                                             as BusinessUnit  
            ,                   ai.objectaccount                                            as ObjectAccount  
            ,                   ai.subaccount                                               as SubAccount  
            , case  
            when                subaccount = ''  
            then                ltrim(ai.businessunit + '.' + ai.objectaccount)  
            else                ltrim(ai.businessunit + '.' + ai.objectaccount + '.' + ai.subaccount)  
            end                                                                             as LongAccount  
            ,                   f.gmdl01                                                    as AccountDescription  
            ,                   ''                                                          as BusinessUnitDescription  
            ,                   ''                                                          as CompanyDescription  
            ,                   ''                                                          as CurrencyCode  
            ,                   f.gmco                                                      as CompanyNumberAcct  
            ,                   0                                                           as Interco  
            ,                   ltrim(rtrim(ai.businessunit))                               as TrimBU  
            ,                   ltrim(rtrim(ai.objectaccount))                              as TrimObj  
            ,                   ltrim(rtrim(ai.subaccount))                                 as TrimSub  
            from                raccountinstr ai  
            inner join          f0901 f  
            on                  f.gmmcu = ai.businessunit  
            and                 f.gmobj = ai.objectaccount  
            and                 isnull(f.gmsub, 1) = isnull(ai.subaccount, 1)  
            where               ai.comment = 'Base AAI'  
 union  
            select distinct top 100 percent reportcompany                                   as CompanyNumber  
            ,                   shortaccount                                                as ShortAccount  
            ,                   gmmcu                                                       as BusinessUnit  
            ,                   gmobj                                                       as ObjectAccount  
            ,                   gmsub                                                       as SubAccount  
            , case  
            when                gmsub = ''  
            then                ltrim(gmmcu + '.' + gmobj)  
            else                ltrim(gmmcu + '.' + gmobj + '.' + gmsub)  
            end                                                                             as LongAccount  
            ,                   f.gmdl01                                                    as AccountDescription  
            ,                   ''                                                          as BusinessUnitDescription  
            ,                   ''                                                          as CompanyDescription  
            ,                   ''                                                          as CurrencyCode  
            ,                   f.gmco                                                      as CompanyNumberAcct  
            ,     0                                                           as Interco  
            ,                   ltrim(rtrim(gmmcu))                                         as TrimBU  
            ,                   ltrim(rtrim(gmobj))                                         as TrimObj  
            ,                   ltrim(rtrim(gmsub))                                         as TrimSub  
            from                ritems  
            join                f0901 f  
            on                  gmaid = shortaccount  
   and     gmco = companynumber) a  
            join                f0006 b  
            on                  a.businessunit = b.mcmcu  
            join                f0010 c  
            on                  a.companynumber = c.ccco  
            join                rcompanies d  
            on                  a.CompanyNumber = d.companynumber  
            union  
            select top 100 percent companynumber  
            ,                   'yyyyyyyy' as shortaccount  
            ,                   ''  
            ,                   ''  
            ,                   ''  
            ,                   'gl class not in base table'  
            ,                   ''  
            ,                   ''  
            ,                   ''  
            ,                   ''  
            ,                   ''  
            ,                   0  
            ,                   ''  
            ,                   ''  
            ,                   ''  
            from                rcompanies  
            union  
            select top 100 percent companynumber  
            ,                   'xxxxxxxx' as shortaccount  
            ,                   ''  
            ,                   ''  
            ,                   ''  
            ,                   'outside operations'  
            ,                   ''  
            ,                   ''  
            ,                   ''  
            ,                   ''  
            ,                   ''  
            ,                   0  
            ,                   ''  
            ,                   ''  
            ,                   ''  
            from                rcompanies  
            order by            companynumber  
            ,                   shortaccount  
  
  
  
