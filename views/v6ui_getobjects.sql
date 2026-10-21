    CREATE View         v6ui_getobjects                                                                                         -- object account filter, filtered by business unit  
            -- with encryption  
            as  
            select      distinct a.companynumber                                            as CompanyNumber  
            ,           ltrim(rtrim(businessunit))                                          as TrimBU  
            ,           objectaccount                                                       as ObjectAccount  
            ,           max(ltrim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace  
            (replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(' '+lower(accountdescription),  
            ' a',' A'),' b',' B'),' c',' C'),' d',' D'),' e',' E'),' f',' F'),' g',' G'),' h',' H'),' i',' I'),' j',' J'),' k',' K'),' l',' L'),  
            ' m',' M'),' n',' N'),' o',' O'),' p',' P'),' q',' Q'),' r',' R'),' s',' S'),' t',' T'),' u',' U'),' v',' V'),' w',' W'),' x',' X'),  
            ' y',' Y'),' z',' Z')))                                                         as Name  
            from        rinvaccountlist a  
            where       objectaccount != ''  
            group by    companynumber  
            ,           businessunit  
            ,           objectaccount  
