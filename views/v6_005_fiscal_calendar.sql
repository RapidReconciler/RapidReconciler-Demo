  
  
CREATE View   [dbo].[v6_005_fiscal_calendar]            --with encryption  
   as  
   select    a.companynumber            as CompanyNumber  
   ,     a.companyname            as CompanyName  
   ,     a.fiscalyear            as FiscalYear  
   ,     a.period             as Period  
   ,     a.yearbegin             as YearBegin  
   ,     a.periodbegin            as PeriodBegin  
   ,     a.periodends            as PeriodEnds  
   ,                   0               as yearbeginsj  
            ,                   0               as periodbeginsj  
            ,                   0               as periodendsj  
   ,     a.daysinperiod            as DaysInPeriod   
   from    (select ccco            as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   1               as period    -- period 1  
            ,                   cddfyj              as yearbegin  
   ,     cddfyj              as periodbegin  
   ,     cdd01j              as periodends  
            ,                   datediff(day, cdd01j, cddfyj) * -1 + 1      as daysinperiod  
   from                f0010  
            join    f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day, cdd01j, cddfyj) * -1 + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   2               as period    -- period 2  
            ,                   cddfyj              as yearbegin  
   ,     dateadd(dd,1,cdd01j)          as periodbegin  
   ,     cdd02j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd01j), cdd02j) + 1    as daysinperiod  
   from                f0010  
            join    f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day,dateadd(dd,1,cdd01j), cdd02j) + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   3               as period    -- period 3  
            ,                   cddfyj              as yearbegin  
   ,     dateadd(dd,1,cdd02j)          as periodbegin  
   ,     cdd03j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd02j), cdd03j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day,dateadd(dd,1,cdd02j), cdd03j) + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   4               as period    -- period 4  
            ,                   cddfyj              as yearbegin  
   ,     dateadd(dd,1,cdd03j)          as periodbegin  
   ,     cdd04j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd03j), cdd04j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day,dateadd(dd,1,cdd03j), cdd04j) + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   5               as period    -- period 5  
            ,                   cddfyj              as yearbegin  
   ,     dateadd(dd,1,cdd04j)          as periodbegin  
   ,     cdd05j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd04j), cdd05j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day,dateadd(dd,1,cdd04j), cdd05j) + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   6               as period    -- period 6  
            ,                   cddfyj              as yearbegin  
   ,     dateadd(dd,1,cdd05j)          as periodbegin  
   ,     cdd06j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd05j), cdd06j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day,dateadd(dd,1,cdd05j), cdd06j) + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   7               as period    -- period 7  
            ,                   cddfyj              as yearbegin  
            , case when cdd07j = cdd06j then '1901-01-01'  
   else    dateadd(dd,1,cdd06j) end         as periodbegin  
   ,     cdd07j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd06j), cdd07j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day,dateadd(dd,1,cdd06j), cdd07j) + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   8               as period    -- period 8  
            ,                   cddfyj              as yearbegin  
            , case when cdd08j = cdd07j then '1901-01-01'  
   else    dateadd(dd,1,cdd07j) end         as periodbegin  
   ,     cdd08j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd07j), cdd08j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day,dateadd(dd,1,cdd07j), cdd08j) + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   9               as period    -- period 9  
            ,                   cddfyj              as yearbegin  
            , case when cdd09j = cdd08j then '1901-01-01'  
   else    dateadd(dd,1,cdd08j) end         as periodbegin  
   ,     cdd09j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd08j), cdd09j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day,dateadd(dd,1,cdd08j), cdd09j) + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   10               as period    -- period 10  
            ,                   cddfyj              as yearbegin  
            , case when cdd10j = cdd09j then '1901-01-01'  
   else    dateadd(dd,1,cdd09j) end         as periodbegin  
   ,     cdd10j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd09j), cdd10j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day,dateadd(dd,1,cdd09j), cdd10j) + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   11               as period    -- period 11  
            ,                   cddfyj              as yearbegin  
            , case when cdd11j = cdd10j then '1901-01-01'  
   else     dateadd(dd,1,cdd10j) end        as periodbegin  
   ,     cdd11j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd10j), cdd11j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day,dateadd(dd,1,cdd10j), cdd11j) + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   12               as period    -- period 12  
            ,                   cddfyj              as yearbegin  
   , case when cdd12j = cdd11j then '1901-01-01'  
   else    dateadd(dd,1,cdd11j) end         as periodbegin  
   ,     cdd12j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd11j), cdd12j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   where    datediff(day,dateadd(dd,1,cdd11j), cdd12j) + 1 > 0  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   13               as period    -- period 13  
            ,                   cddfyj              as yearbegin  
   , case when   cdd12j = cdd13j then '1901-01-01'  
   else    dateadd(dd,1,cdd12j) end         as periodbegin  
   ,     cdd13j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd12j), cdd13j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   union  
   select              ccco              as companynumber  
            ,                   ccname              as companyname  
            ,                   cdfy              as fiscalyear  
            ,                   14               as period    -- period 14  
            ,                   cddfyj              as yearbegin  
   , case when   cdd13j = cdd14j then '1901-01-01'  
   else    dateadd(dd,1,cdd13j) end         as periodbegin  
   ,     cdd14j              as periodends  
            ,                   datediff(day,dateadd(dd,1,cdd13j), cdd14j) + 1    as daysinperiod  
   from                f0010  
            inner join          f0008  
            on                  ccdtpn = cddtpn  
   ) a  
            inner join          rcompanies b  
            on                  a.companynumber = b.companynumber  
   where    a.periodbegin > '1901-01-01'  
  
