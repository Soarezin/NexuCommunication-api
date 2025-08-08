import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.DATABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Use a service key aqui

export const supabase = createClient(supabaseUrl, supabaseKey);
