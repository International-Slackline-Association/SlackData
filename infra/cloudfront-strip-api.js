// CloudFront Function (viewer-request) — strips the "/api" prefix so the API
// Gateway / Lambda behind the "/api/*" cache behavior sees the bare FastAPI
// route (e.g. browser calls /api/webbing → Lambda receives /webbing). This lets
// the SPA and the API share ONE CloudFront domain (same-origin, zero CORS) while
// the app code keeps its unprefixed routes. FastAPI's API_ROOT_PATH=/api keeps
// the /docs + openapi.json URLs correct.
//
// Deployed as an AWS::CloudFront::Function; the code is also inlined in
// infra/serverless.yml. Keep the two in sync.
function handler(event) {
    var request = event.request;
    request.uri = request.uri.replace(/^\/api/, '');
    if (request.uri === '') {
        request.uri = '/';
    }
    return request;
}
