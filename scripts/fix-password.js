import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function resetPassword() {
  const email = 'slaff.trosheen@gmail.com';
  const newPassword = 'Slaff181188';

  console.log(`Resetting password for ${email}...`);

  // 1. Get User ID by Email (Admin API)
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error("Error listing users:", listError);
    return;
  }

  const user = users.find(u => u.email === email);

  if (!user) {
    console.error("User not found via Admin API! Creating user...");
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: newPassword,
      email_confirm: true,
      user_metadata: { username: 'slaff', full_name: 'Slaff Trosheen' }
    });

    if (createError) {
      console.error("Error creating user:", createError);
    } else {
      console.log("User created successfully:", newUser.user.id);
    }
    return;
  }

  // 2. Update User
  const { data, error } = await supabase.auth.admin.updateUserById(
    user.id,
    { password: newPassword, email_confirm: true }
  );

  if (error) {
    console.error("Error resetting password:", error);
  } else {
    console.log("Password reset successfully for:", data.user.email);
  }
}

resetPassword();
