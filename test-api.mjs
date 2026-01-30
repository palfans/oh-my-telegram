import axios from 'axios';

const botToken = '8598173520:AAFOueWt-WkUrKqjj1sUO_oD0Un-t4RcbmI';
const apiUrl = `https://api.telegram.org/bot${botToken}`;

async function test() {
  console.log('[1] Starting test');
  
  try {
    console.log('[2] Calling getUpdates with 30s timeout');
    const start = Date.now();
    
    const response = await axios.post(`${apiUrl}/getUpdates`, {
      timeout: 30
    }, {
      timeout: 60000
    });
    
    const elapsed = Date.now() - start;
    console.log(`[3] Got response after ${elapsed}ms`);
    console.log('[4] Result:', response.data.ok, 'updates:', response.data.result?.length || 0);
    
    // Now call again immediately
    console.log('[5] Calling getUpdates again');
    const response2 = await axios.post(`${apiUrl}/getUpdates`, {
      timeout: 30
    }, {
      timeout: 60000
    });
    
    const elapsed2 = Date.now() - start;
    console.log(`[6] Second response after ${elapsed2}ms`);
    console.log('[7] Result:', response2.data.ok, 'updates:', response2.data.result?.length || 0);
    
  } catch (error) {
    console.log('[ERROR]', error.code, error.message);
  }
}

test();
