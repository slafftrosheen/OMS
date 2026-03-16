#!/bin/bash
# Fix the $effect + untrack pattern in orders/+page.svelte

FILE="/workspace/src/routes/orders/+page.svelte"

# Create backup
cp "$FILE" "$FILE.bak"

# Replace the problematic $effect block with $derived
# The old code (lines 82-92):
#   $effect(() => {
#     const orders = orderState.orders;
#     const filtered = isAdmin 
#       ? orders 
#       : orders.filter((order: any) => !order.isDraft);
#     
#     untrack(() => {
#       rows = filtered.map(toRow);
#       hasLoadedOnce = true;
#     });
#   });

# New code using $derived
sed -i '/\/\/ Update local rows when orderState.orders changes/,/});/{
  /\/\/ Update local rows when orderState.orders changes/c\
  // Use $derived for reactive filtering instead of $effect + untrack\
  let filteredOrders = $derived.by(() => {\
    const orders = orderState.orders;\
    return isAdmin\
      ? orders\
      : orders.filter((order: any) => !order.isDraft);\
  });\
\
  // Update rows reactively\
  rows = filteredOrders.map(toRow);\
  hasLoadedOnce = true;
  /untrack/,/});/d
}' "$FILE"

echo "Fixed orders/+page.svelte"
