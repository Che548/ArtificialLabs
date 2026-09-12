// Runs on the test host, not the phone. This is the dedicated loopback-only
// QA proxy; it never changes the real Convex deployment or device settings.
if (QA_TRANSPORT !== 'up' && QA_TRANSPORT !== 'down') throw new Error('Invalid QA transport state');
var reply = http.post('http://127.0.0.1:3350/__e2e_transport/' + QA_TRANSPORT, {
  headers: { 'x-e2e-control': 'local-qa' },
  body: '{}',
});
if (reply.status !== 204) throw new Error('Local QA transport control failed');
