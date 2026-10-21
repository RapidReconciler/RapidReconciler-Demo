    Create View         v6ui_getperiodendclose                                                                                  -- default for period ends dropdown  
            -- with encryption  
            as  
            select  
            case  
            when        max(periodends) is null  
            then        getdate()  
            else        max(periodends)  
            end                                                                             as PeriodEnds  
            from        rfiscalcalendar  
            where       periodends < getdate()  
