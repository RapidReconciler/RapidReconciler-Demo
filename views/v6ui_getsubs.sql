    CREATE View         v6ui_getsubs                                                                                            -- sub account filter, filtered by object account  
            -- with encryption  
            as  
            select      distinct top 100 percent companynumber                              as CompanyNumber  
            ,           businessunit                                                        as BusinessUnit  
            ,           objectaccount                                                       as ObjectAccount  
            ,           subaccount                                                          as SubAccount  
            ,           ltrim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace  
            (replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(' '+lower(accountdescription),  
            ' a',' A'),' b',' B'),' c',' C'),' d',' D'),' e',' E'),' f',' F'),' g',' G'),' h',' H'),' i',' I'),' j',' J'),' k',' K'),' l',' L'),  
            ' m',' M'),' n',' N'),' o',' O'),' p',' P'),' q',' Q'),' r',' R'),' s',' S'),' t',' T'),' u',' U'),' v',' V'),' w',' W'),' x',' X'),  
            ' y',' Y'),' z',' Z'))                                                          as AccountDescription               -- in proper    case  
            from        rinvaccountlist  
            order by    companynumber  
            ,           subaccount  
