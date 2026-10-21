    CREATE Procedure    usp6getserverstatus  
            ( @lightstatus                  nchar(1)                            = ''        output  
            , @process                      nvarchar(100)                       = ''        output  
            , @error                        nvarchar(100)                       = ''        output  
            , @asof                         smalldatetime                       = null      output )  
            -- with encryption  
            as  
            set nocount on  
            declare     @isrunning          int  
            -- display data  
            select      top 1 @process = step, @error = process  
            from        rserver_log  
            where       step not in ( 'Company', 'Constants', 'Users', 'Item Balance Reset' )  
            order by    starttime desc  
            select      @asof = ( select max( capturecomplete ) from   runhistory )  
            set         @process = isnull( @process,'' )  
            set         @error = isnull( @error,'' )  
            if          ( @error like 'Successfully%Completed%' )  
            begin  
            set         @lightstatus = 'G'  
            end  
            else  
            begin  
            set         @lightstatus = 'R'  
            end  
            set nocount off  
