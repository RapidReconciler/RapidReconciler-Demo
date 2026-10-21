  
    CREATE view         [dbo].[v6ui_raccountsummary]                                                                                    -- Rec Tab.         Click roll forward indicator  
            -- with encryption  
            as  
            select distinct a.periodends                                                    as PeriodEnds  
            ,           a.companynumber                                                     as CompanyNumber  
            ,           shortaccount                                                        as ShortAccount  
            ,           longaccount                                                         as LongAccount  
            ,           isnull(tocurr,currencycode)                                         as Currency  
            ,           isnull(rate,1)                                                      as Rate  
            , case when rate is null    then round(beginningbalance,2)  
            else                             round(beginningbalance * rate,2)           end as BegGL  
            , case when rate is null    then round(ledgeramount,2)  
            else                             round(ledgeramount * rate,2)               end as PerGL  
            , case when rate is null    then round(endingglbalance ,2)  
            else                             round(endingglbalance * rate ,2)           end as EndGL  
            ,           glrollok                                                            as GLOK  
            , case when rate is null    then round(unpostedbatchamount,2)  
            else                             round(unpostedbatchamount * rate,2)        end as UnpostBatch  
            , case when rate is null    then round(cardexamount,2)  
            else                             round(cardexamount * rate,2)               end as PerCX  
            , case when rate is null    then round(amountonhand - balcxvar,2)  
            else                             round((amountonhand - balcxvar) * rate ,2) end as Perpetual  
            , case when rate is null    then round(accountvariance,2)  
            else                             round(accountvariance * rate,2)            end as BegVar  
            , case when rate is null    then round(endofday,2)  
            else                             round(endofday * rate,2)                   end as EndofDay  
            , case when rate is null    then round(transactionvariance,2)  
            else                             round(transactionvariance * rate,2)        end as Variance  
            , case when rate is null    then round(journalentries,2)  
            else                             round(journalentries * rate,2)             end as JEs  
            , case when rate is null    then round(outofbalance,2)  
            else                             round(outofbalance * rate,2)               end as OOB  
            , case when rate is null    then round(balcxvar,2)  
            else                             round(balcxvar * rate,2)                   end as CardexVar  
            ,           oobrollok                                                           as VarOK  
            ,           businessunit                                                        as BusinessUnit  
            ,           objectaccount                                                       as ObjectAccount  
            ,           subaccount                                                          as SubAccount  
            from        raccountsummary a  
            join        v6ui_getcompanies c  
            on          a.companynumber = c.companynumber  
            left join   vcr_f1113 d  
            on          c.currencycode = d.fromcurr  
            and         c.reportcurrency = d.tocurr  
            and         c.RateType = d.ratetype  
            and         a.periodends between d.startdate and d.enddate  
            where       shortaccount not in ('xxxxxxxx','yyyyyyyy')  
  
