  
CREATE View      [dbo].[v6_006_perpetual]  
            -- with encryption  
            as  
            select      a.itemid                                                            as itemid  
            ,case when  comp.subledgerwo = 0 then isnull(b.lipqoh,0) else 0 end             as baselineqoh      -- subledgerwo field in rcompanies table set in procedure 002a  
            ,case when  comp.subledgerwo = 0 then isnull(b.lipqoh,0) * isnull(councs,0) else 0 end as baselineaoh    -- 0 if the company is new and does not have a baseline in As Of table  
            ,case when  comp.subledgerwo = 0 then isnull(e.quantity,0) else 0 end           as baselineqic      -- 9 if the company already has a baseline  
            ,case when  comp.subledgerwo = 0 then isnull(e.amount,0) else 0 end             as baselineaic  
            ,case when  a.costlevel != imclev or a.primaryuom != imuom1 then 0                                                  -- if the cost level or uom is changed  
            else        isnull(b.lipqoh,0) end                                              as quantityonhand                   -- the quantity on hand must be zero on the old records  
            ,           isnull(b.lipqoh,0) * isnull(councs,0)                               as amountonhand  
            ,           round(isnull(e.quantity,0),6)                                       as quantityincardex  
            ,           round(isnull(e.amount,0),2)                                         as amountincardex  
            ,           0                                                                   as baselinevar  
            ,           0                                                                   as estunits  
            ,           ''                                                                  as reason  
            ,           isnull(coledg,'XX')                                                 as costmethod  
            ,           isnull(councs,0)                                                    as unitcost  
            ,           isnull(g.material,0)                                                as material  
            ,           isnull(g.labor,0)                                                   as labor  
            ,           isnull(g.overhead,0)                                                as overhead  
            ,           isnull(a.primaryuom,'')                                             as uom  
            ,           isnull(lilots,'')                                                   as lotstatus  
            ,           checksum(b.lipqoh, z.councs, round(e.quantity,6), round(e.amount,2), imclev, imuom1, g.material, e.quantity)as hashtotal  
  
            from        ritems a                        -- start with complete item base  
     
   join  rcompanies comp                       -- licensed companies only  
   on   a.companynumber = comp.companynumber                 -- in case there are duplicate costs                                                                    
  
            join        f4101  
            on          a.shortitem = imitm  
  
            left join   f41021 b                                                                                                -- get on hand quantity  
            on          a.itemid = b.itemid  
  
            left join   f4105 z                                                                                                 -- get unit costs  
            on          a.shortitem = coitm  
            and case when a.costlevel > 1 then a.branchplant else '' end = comcu  
            and case when a.costlevel > 2 then a.location else '' end = colocn  
            and case when a.costlevel > 2 then a.lot else '' end = colotn  
            and         cocsin = 'I'  
  
            left join                                                                                                           -- get cost components  
            ( select    ieitm                                  as ShortItem  
            ,           iemmcu                                                              as BranchPlant  
            ,           ielocn                                                              as Location  
            ,           ielotn                                                              as Lot  
            , sum(case when iecost not like 'B%'  
            and             iecost not like 'C%'    then isnull(iecsl,0) else 0 end)        as Material  
            , sum(case when iecost like 'B%'        then isnull(iecsl,0) else 0 end)        as Labor  
            , sum(case when iecost like 'C%'        then isnull(iecsl,0) else 0 end)        as Overhead  
            from        f30026  
            where       ieledg = '07'  
            group by    ieitm  
            ,           iemmcu  
            ,           ielocn  
            ,           ielotn) g  
            on          g.shortitem     = a.shortitem  
            and         g.branchplant   = case when a.costlevel in ('2','3')    then a.branchplant  else '' end  
            and         g.location      =  '' -- case when a.costlevel = '3'           then a.location     else '' end  
            and         g.lot           =  '' --case when a.costlevel = '3'           then a.lot          else '' end  
  
  
            left join   (select itemid, sum(quantity) quantity, sum(amount) amount          -- get cardex totals  
            from        rtransactions  
            group by    itemid)                                                             as e  
            on          a.itemid = e.itemid       -- added cardex quantity field to hash total  
