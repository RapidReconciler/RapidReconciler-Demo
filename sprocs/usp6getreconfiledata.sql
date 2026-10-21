    CREATE Procedure    [dbo].[usp6getreconfiledata]  
            ( @table                        nchar(30)                                       = null  
            , @companynumber                nvarchar(5)                                     = ''  
            , @accountnumber                nvarchar(28)                                    = ''  
            , @businessunit                 nvarchar(12)                                    = ''  
            , @periodends                   datetime                                        = null  
            , @excludecompanies             nvarchar(255)                                   = null  
            , @includecompanies             nvarchar(4000)                                   = null  
            , @includebusinessunits         varchar(max)                                    = null  
            , @includeobjects               nvarchar(4000)                                  = null  
            , @includesubs                  nvarchar(4000)                                  = null  
            , @withnotes                    bit                                             = 0  
            , @viewname                     nchar(30)                                       = 'v6ui_reconfiledata'  
            , @reasoncode                   nchar(3)                                        = null  
            , @returnrows                   bit                                             = 0  
            , @debug                        bit                                             = 0 )  
            -- with encryption  
            as  
            exec usp6getfilteredview  
            @table                                                                          = @table  
            , @companynumber                                                                = @companynumber  
            , @accountnumber                                                                = @accountnumber  
            , @businessunit                                                                 = @businessunit  
            , @periodends                                                                   = @periodends  
            , @excludecompanies                                                             = @excludecompanies  
            , @includecompanies                                                             = @includecompanies  
            , @includebusinessunits                                                         = @includebusinessunits  
            , @includeobjects                                                               = @includeobjects  
            , @includesubs                                                                  = @includesubs  
            , @viewname                                                                     = @viewname  
            , @withnotes                                                                    = @withnotes  
            , @returnrows                                                                   = @returnrows  
            , @reasoncode                                                                   = @reasoncode  
            , @debug                                                                        = @debug  
