-- Reset Admin Passwords
-- Updates the password for 'admin@reclamefabriek.com' and 'slaff@example.com'
-- Password will be set to: Slaff181188

UPDATE auth.users
SET encrypted_password = crypt('Slaff181188', gen_salt('bf'))
WHERE email IN ('admin@reclamefabriek.com', 'slaff@example.com', 'slaff@reclamefabriek.com');

-- Ensure the user is confirmed
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email IN ('admin@reclamefabriek.com', 'slaff@example.com', 'slaff@reclamefabriek.com')
AND email_confirmed_at IS NULL;
