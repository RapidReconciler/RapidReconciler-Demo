    CREATE View         [dbo].[v6ui_reconcilingitems]  
            -- with encryption  
            as  
            select      isnull(note.worked,0)                                               as Worked  
            ,           rtrim(isnull(note.note,''))                                         as Note  
            ,           ''                                                                  as Status  
            ,           a.companynumber                                                     as CompanyNumber  
            ,           rtrim(b.longaccount )                                               as LongAccount  
   ,   case when subtype = 'periods' then 'Period Accrual'  
   when  subtype = 'Accounts' then substring(comment,11,29)  
   when  oa.offsetaccount is null  then 'TBD'   
   when  oa.offsetaccount = '' then 'TBD'  
   else  oa.offsetaccount end            as OffsetAccount  
            ,           rtrim(type)                                                         as Type  
            ,           rtrim(subtype)                                                      as SubType  
            ,           rtrim(a.ordertype)                                                  as OT  
            ,           rtrim(a.doctype)                                                    as DT  
            ,           a.docnumber                                                         as DocNumber  
            , case when rate is null    then cardexamount else cardexamount * rate  end     as CardexAmount  
            , case when rate is null    then ledgeramount else ledgeramount * rate  end     as LedgerAmount  
            , case when rate is null    then variance     else variance * rate      end     as Variance  
            , case when tocurr is null  then currencycode else tocurr               end     as Currency  
            ,           rtrim(comment)                                                      as Comment  
            ,           ordernumber                                                         as OrderNumber  
            ,           batchtype                                                           as BatchType  
            ,           cast(a.batch as integer)                                            as Batch  
            ,           a.periodends                                                        as PeriodEnds  
            ,           creationdate                                                        as TransDate  
            ,           reltype                                                             as RelType  
            ,           relorder                                                            as RelOrder  
            ,           origcomp                                                            as OrigComp  
            ,           origorder                                                           as OrigOrder  
            ,           origtype                                                            as OrigType  
            ,           origdoc                                                             as OrigDoc  
            ,           origdoctype                                                         as OrigDocType  
            ,           glxref                                                              as GLXref  
   ,   groupcode               as GroupCode  
            from        rcardexledgercompare2 a  
            join        rinvaccountlist b  
            on          a.companynumber  = b.companynumber  
            and         a.shortaccount  = b.shortaccount  
            and         recstatus = 1  
            join        v6ui_getcompanies c  
            on          a.companynumber = c.companynumber  
   left join   roffsetaccounts oa  
            on          a.companynumber = oa.companynumber  
            and         b.longaccount = oa.longaccount  
            and         a.doctype = oa.doctype  
            and         a.ordertype = oa.ordertype  
            and         oa.varsource = 'TRN'  
            left join   vcr_f1113 d   
            on          c.currencycode = d.fromcurr  
            and         c.reportcurrency = d.tocurr  
            and         c.ratetype = d.ratetype  
            and         a.periodends between d.startdate and d.enddate  
            left join   rcardexledgercompare2worknote note  
            on          a.companynumber = note.companynumber  
            and         b.longaccount = note.inventoryaccount  
            and         a.ordertype = note.ordertype  
            and         a.doctype = note.doctype  
            and         a.docnumber = note.docnumber  
            and         a.periodends = note.periodends  
            and         a.batch = note.mfgbatch  
  
  
