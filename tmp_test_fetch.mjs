
const supabaseUrl = 'https://kaxwuclrddyeetflneil.supabase.co';
console.log(`Testing fetch to ${supabaseUrl}...`);

fetch(supabaseUrl, { method: 'HEAD' })
  .then(res => {
    console.log('Fetch successful!');
    console.log('Status:', res.status);
  })
  .catch(err => {
    console.error('Fetch failed:');
    console.error(err);
  });
