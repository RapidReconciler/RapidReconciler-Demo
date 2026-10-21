    CREATE Procedure    [dbo].[usp6getperiodends]  
            -- with encryption  
            as  
            set nocount on  
            declare @counter int  
            set @counter = ( select count( * ) from raccountsummary )  
            if @counter = 0  
            begin  
            select convert( nvarchar(8), getdate( ), 1 )                                    as PeriodEnds  
            , getdate( )                                                                    as ped  
            end  
            else  
            select distinct top 100 percent convert( nvarchar(8), periodends, 1 )           as PeriodEnds  
            , periodends                                                                    as ped  
            from   raccountsummary a  
            order  by 2 desc  
            set nocount off  
