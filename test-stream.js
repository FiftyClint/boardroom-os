// Run with: node test-stream.js

async function runTest() {
  // We'll assume the endpoint will be POST /api/board/stream
  const url = 'http://localhost:3000/api/board/stream';
  
  console.log(`Sending POST request to ${url} ...`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: If requireAuth is added to the route later, 
        // you might need to append a valid connect.sid cookie here.
      },
      body: JSON.stringify({
        topic: 'Should we acquire a local 10MW solar farm?',
        memberId: 'munger',
        sessionId: 'test-session-123'
      })
    });

    if (!response.ok) {
      console.error(`HTTP Error: ${response.status} ${response.statusText}`);
      const body = await response.text();
      console.error('Response body:', body);
      return;
    }

    console.log('Connected! Receiving SSE events...\n');

    // Read the streaming chunks directly
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      // We use process.stdout.write to print chunk-by-chunk without extra newlines
      process.stdout.write(chunk);
    }
    
    console.log('\n\n[Stream Connection Closed]');
    
  } catch (error) {
    console.error('Fetch error:', error.message);
  }
}

runTest();
