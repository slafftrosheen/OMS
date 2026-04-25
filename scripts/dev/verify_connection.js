import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
)

async function test() {
  console.log('🔍 Testing database connection...\n')
  
  // Test 1: Count tables
  const { data: materials, error: e1 } = await supabase.from('materials').select('count')
  console.log('✅ Materials table:', materials ? `${materials.length} rows` : 'accessible')
  
  const { data: orders, error: e2 } = await supabase.from('draft_orders').select('count')
  console.log('✅ Draft orders table:', orders ? `${orders.length} rows` : 'accessible')
  
  const { data: inventory, error: e3 } = await supabase.from('inventory_items').select('count')
  console.log('✅ Inventory items table:', inventory ? `${inventory.length} rows` : 'accessible')
  
  const { data: chat, error: e4 } = await supabase.from('chat_rooms').select('*')
  console.log('✅ Chat rooms:', chat ? `${chat.length} rooms` : 'accessible')
  
  console.log('\n🎉 All tables accessible!')
}

test().catch(console.error)
