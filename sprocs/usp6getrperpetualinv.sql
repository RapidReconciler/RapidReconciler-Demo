  
------>>>>>>>>>>    UI Inventory Tab Procedures  
    CREATE Procedure    [dbo].[usp6getrperpetualinv]  
            ( @table                        nchar(30)                                       = null  
            , @companynumber                nvarchar(5)                                     = ''  
            , @accountnumber                nvarchar(28)                                    = ''  
            , @businessunit                 nvarchar(12)                                    = ''  
            , @periodends                   datetime                                        = null  
            , @excludecompanies             nvarchar(255)                                   = null  
            , @includecompanies             varchar(4000)                                   = null  
            , @includebusinessunits         varchar     (max)                               = null  
            , @includeobjects               varchar     (max)        = null  
            , @includesubs                  varchar     (max)        = null  
            , @commonuom                    nchar       (2)                                 = null  
            , @summarizebyitem              nchar       (1)                                 = 'N'  
            , @withnotes                    bit                                             = 0  
            , @viewname                     nchar(30)                                       = 'perpetualinv'  
            , @reasoncode                   nchar(3)                                        = null  
            , @returnrows                   bit                                             = 0  
            , @debug                        bit                                             = 0  
   , @page       int            = 1  
   , @recsperpage     decimal(18,3)         = 250  
   , @columnfilters    varchar(max)         = null  
   , @asofdate      date           = null)  
            -- with encryption  
            as  
            exec usp6getasofpaginated  
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
            , @commonuom                                                                    = @commonuom  
            , @summarizebyitem                                                              = @summarizebyitem  
            , @debug                                                                        = @debug  
   , @page                   = @page  
   , @recsperpage                 = @recsperpage  
   , @columnfilters                = @columnfilters  
   , @asofdate                  = @asofdate
