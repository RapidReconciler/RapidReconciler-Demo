/*
 * Shared variance-source config — the inventory-reconciliation variance
 * sources: page copy + the view's grid columns + how each is fetched.
 *
 * Single source of truth for the per-source standalone pages
 * (inventory-variance-source.html). The reconciliation page's preview modal
 * keeps its own PREVIEW_COLUMNS for now; converge it onto this file next so
 * columns can't drift.
 *
 * fetch kinds:
 *   'integrity'           POST /inventory/integrity {report}            (cardex)
 *   'variance-component'  POST /inventory/variance-component {component} (glBatches/endOfDay/JEs)
 *   'priorPeriodBreakdown' POST /inventory/reconciliation/history — the prior period's
 *                          6-component variance composition (carry forward); the grid's
 *                          authoritative total is that period's unreconciledVariance, not
 *                          a column sum (the components carry sign conventions).
 *   'page'                navigates to its own existing page (transactions)
 *
 * Column `kind`: text | mono | num | qty (+ optional sort:'date').
 */
window.RR_VARIANCE_SOURCES = {
  carryForward: {
    label: 'Carry forward',
    lede: 'Prior-period unreconciled balance rolled into this period.',
    action: 'Book a journal entry to clear it', owner: 'Finance',
    fetch: 'priorPeriodBreakdown', amountField: 'amount',
    columns: [
      { label: 'Source', key: 'component', kind: 'text' },
      { label: 'Amount', key: 'amount',    kind: 'num'  }
    ]
  },

  glBatches: {
    label: 'GL batches',
    lede: 'Un-posted GL batches contributing to the variance.',
    action: 'Post the batch', owner: 'Accounting ops',
    fetch: 'variance-component', component: 'glBatches', amountField: 'amount',
    columns: [
      { label: 'CompanyNumber',   key: 'companyNumber', kind: 'text' },
      { label: 'BatchDate',       key: 'batchDate',     kind: 'mono' },
      { label: 'PeriodEnds',      key: 'periodEnds',    kind: 'mono' },
      { label: 'Username',        key: 'username',      kind: 'text' },
      { label: 'LongAccount',     key: 'longAccount',   kind: 'mono' },
      { label: 'BatchNumber',     key: 'batchNumber',   kind: 'mono' },
      { label: 'Type',            key: 'type',          kind: 'text' },
      { label: 'Amount',          key: 'amount',        kind: 'num'  },
      { label: 'Approval_Status', key: 'apprsts',       kind: 'text' },
      { label: 'Posting_Status',  key: 'poststs',       kind: 'text' }
    ]
  },

  endOfDay: {
    label: 'Orders',
    lede: 'Sales / work orders waiting for end of day.',
    action: 'Run end of day', owner: 'Ops / IT',
    fetch: 'variance-component', component: 'endOfDay', amountField: 'transactionAmount',
    columns: [
      { label: 'TransactionDate',   key: 'transactionDate',   kind: 'mono' },
      { label: 'Company',           key: 'companyNumber',     kind: 'text' },
      { label: 'Type',              key: 'type',              kind: 'text' },
      { label: 'OrderType',         key: 'orderType',         kind: 'text' },
      { label: 'LongAccount',       key: 'longAccount',       kind: 'mono' },
      { label: 'DocType',           key: 'docType',           kind: 'text' },
      { label: 'DocNumber',         key: 'docNumber',         kind: 'mono' },
      { label: 'BranchPlant',       key: 'branchPlant',       kind: 'text' },
      { label: 'Status',            key: 'status',            kind: 'text' },
      { label: 'TransactionAmount', key: 'transactionAmount', kind: 'num'  }
    ]
  },

  transactions: {
    label: 'Transactions',
    lede: 'Item Ledger to General Ledger discrepancies.',
    action: 'Review & book a journal entry', owner: 'Finance',
    fetch: 'page', href: 'inventory-transactions.html'
  },

  cardex: {
    label: 'Cardex',
    lede: 'Summarized item-ledger to item-balance discrepancies. Current-state report (not period-historical).',
    action: 'Adjust inventory', owner: 'Tech / IT',
    fetch: 'integrity', report: 'v6ui_itemrollintegritydialog', amountField: 'adjAmount',
    requirePeriod: false,
    columns: [
      { label: 'Reason',        key: 'reason',        kind: 'text' },
      { label: 'CompanyNumber', key: 'companyNumber', kind: 'text' },
      { label: 'LongAccount',   key: 'longAccount',   kind: 'mono' },
      { label: 'Branch',        key: 'branch',        kind: 'text' },
      { label: 'ShortItem',     key: 'shortItem',     kind: 'mono' },
      { label: 'ItemNumber',    key: 'itemNumber',    kind: 'mono' },
      { label: 'ThirdItem',     key: 'thirdItem',     kind: 'mono' },
      { label: 'Location',      key: 'location',      kind: 'text' },
      { label: 'Lot',           key: 'lot',           kind: 'text' },
      { label: 'Method',        key: 'method',        kind: 'text' },
      { label: 'AdjAmount',     key: 'adjAmount',     kind: 'num'  },
      { label: 'AdjQty',        key: 'adjQty',        kind: 'qty'  },
      { label: 'UOM',           key: 'uom',           kind: 'text' },
      { label: 'GLClass',       key: 'glClass',       kind: 'text' },
      { label: 'Cost Level',    key: 'costLevel',     kind: 'text' },
      { label: 'Last Activity', key: 'lastActivity',  kind: 'mono', sort: 'date' },
      { label: 'Tx Count',      key: 'txCount',       kind: 'qty'  },
      { label: 'QOH',           key: 'qtyOnHand',     kind: 'qty'  }
    ]
  },

  manualJournalEntries: {
    label: 'Journal Entries',
    lede: 'Manual journal entries posted to inventory accounts.',
    action: 'Review the entries', owner: 'Finance',
    fetch: 'variance-component', component: 'manualJournalEntries', amountField: 'amount',
    columns: [
      { label: 'CompanyNumber', key: 'companyNumber', kind: 'text' },
      { label: 'PeriodEnds',    key: 'periodEnds',    kind: 'mono' },
      { label: 'DocType',       key: 'docType',       kind: 'text' },
      { label: 'DocNumber',     key: 'docNumber',     kind: 'mono' },
      { label: 'LongAccount',   key: 'longAccount',   kind: 'mono' },
      { label: 'Amount',        key: 'amount',        kind: 'num'  },
      { label: 'UserName',      key: 'username',      kind: 'text' },
      { label: 'Originator',    key: 'originator',    kind: 'text' },
      { label: 'Explanation',   key: 'explanation',   kind: 'text' },
      { label: 'Remark',        key: 'remark',        kind: 'text' }
    ]
  }
};
