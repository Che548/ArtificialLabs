import { httpRouter } from 'convex/server';

import { recognize } from './documentOcrHttp';

import { auth } from './auth';

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({path:'/document-ocr/page',method:'POST',handler:recognize});

export default http;
