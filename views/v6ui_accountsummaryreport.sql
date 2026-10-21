  
  
    CREATE View         [dbo].[v6ui_accountsummaryreport]                                                                               -- Rec Tab.         Click report button  
            -- with encryption  
            as  
            select      a.periodends                                                        as PeriodEnds  
            ,           a.companynumber                                                     as CompanyNumber  
            ,           longaccount                                                         as LongAccount  
            ,           isnull(tocurr, currencycode)                                        as Currency  
            ,           isnull(rate,1)                                                      as Rate  
            , case when rate is null    then beginningbalance  
            else                             beginningbalance * rate    end                 as BegBal  
            , case when rate is null    then ledgeramount  
            else                             ledgeramount * rate        end                 as PerGL  
            , case when rate is null    then endingglbalance  
            else                             endingglbalance * rate     end                 as EndGLBal  
            ,           glrollok                                                            as GLOK  
            , case when rate is null    then unpostedbatchamount  
            else                             unpostedbatchamount * rate end                 as UnpstGL  
            , case when rate is null    then amountonhand - balcxvar  
            else                             (amountonhand - balcxvar) * rate end           as Perpetual  
            , case when rate is null    then accountvariance  
            else                             accountvariance * rate     end                 as BegVar  
            , case when rate is null    then endofday * -1  
            else                             endofday * rate * -1       end                 as EndofDay  
            , case when rate is null    then transactionvariance * -1  
            else                             transactionvariance * rate * -1 end            as Variance  
            , case when rate is null    then journalentries  
            else                             journalentries * rate      end                 as JEs  
            , case when rate is null    then outofbalance  
            else                             outofbalance * rate        end                 as OutofBal  
            , case when rate is null    then balcxvar  
            else                             balcxvar * rate            end                 as ItemRoll  
            ,           oobrollok                                                           as VarOK  
            ,           ltrim(businessunit)                                                 as BusinessUnit  
            ,           objectaccount                                                       as ObjectAccount  
            from        raccountsummary a  
            join        v6ui_getcompanies c  
            on          a.companynumber = c.companynumber  
            left join   vcr_f1113 d   
            on          c.currencycode = d.fromcurr  
            and         c.reportcurrency = d.tocurr  
            and         c.ratetype = d.ratetype  
            and         a.periodends between d.startdate and d.enddate  
  
