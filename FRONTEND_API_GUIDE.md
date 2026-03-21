# Chat Backend API Guide for Frontend (RTK Query)

This document explains the request/response contract, authentication flow, real-time socket flow, and how to structure RTK Query files against this backend.

## 1. Base Setup

- Base URL (dev): `http://localhost:5000`
- API Prefix: `/api`
- Health check: `GET /health`

All API responses use a common envelope:

```json
{
  "success": true,
  "message": "Some message",
  "data": {}
}
```

Error envelope:

```json
{
  "success": false,
  "message": "Error message",
  "errors": []
}
```

## 2. Authentication and Token Flow

### Token strategy

- Access token: returned in JSON (`accessToken`), send in `Authorization: Bearer <token>`
- Refresh token: stored in httpOnly cookie (`refreshToken`) on auth endpoints

### Frontend implications

- Keep access token in Redux memory/state (or secure storage strategy)
- Always send `credentials: 'include'` in fetch/baseQuery so refresh cookie works
- On `401`, call `POST /api/auth/refresh`, then retry original request

### Auth endpoints

#### POST `/api/auth/register`
Body:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Password1"
}
```

Success `201`:

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "_id": "...",
      "name": "John Doe",
      "email": "john@example.com",
      "avatar": "",
      "bio": "",
      "isOnline": false,
      "lastSeen": "2026-03-18T00:00:00.000Z",
      "createdAt": "...",
      "updatedAt": "..."
    },
    "accessToken": "jwt_access_token"
  }
}
```

#### POST `/api/auth/login`
Body:

```json
{
  "email": "john@example.com",
  "password": "Password1"
}
```

Success `200` has same shape as register (`user + accessToken`).

#### POST `/api/auth/refresh`
- Uses refresh cookie only
- No request body

Success:

```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "accessToken": "new_jwt_access_token"
  }
}
```

#### POST `/api/auth/logout` (protected)
- Requires access token + refresh cookie

#### GET `/api/auth/me` (protected)
Returns lightweight authenticated user attached by middleware:

```json
{
  "success": true,
  "message": "Current user",
  "data": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "avatar": "",
    "isOnline": true
  }
}
```

## 3. User APIs

All `/api/users/*` endpoints are protected.

#### GET `/api/users/me`
Returns full profile from DB.

#### GET `/api/users/:id`
Returns another user profile.

#### GET `/api/users/search?q=<query>`
Returns up to 20 users.

#### PATCH `/api/users/me` (multipart/form-data)
Fields:
- `name` (optional)
- `bio` (optional)
- `avatar` (optional file)

Use `FormData` from frontend.

## 4. Chat APIs

All `/api/chats/*` endpoints are protected.

### One-to-one chat

#### POST `/api/chats`
Body:

```json
{
  "userId": "targetUserObjectId"
}
```

- Returns existing 1-to-1 chat if already present
- Else creates new

#### GET `/api/chats`
Returns all chats for current user (sorted by latest activity).

#### GET `/api/chats/:id`
Returns specific chat details.

### Group chat

#### POST `/api/chats/group` (multipart/form-data)
Fields:
- `name` (required)
- `participantIds` (required, array)
- `description` (optional)
- `avatar` (optional file)

Note for form-data arrays:
- send repeated key `participantIds`
- or JSON stringify and parse in frontend/backend convention

#### PATCH `/api/chats/:id/rename`
Body:

```json
{
  "name": "New Group Name"
}
```

#### PUT `/api/chats/:id/participants`
Body:

```json
{
  "userIds": ["id1", "id2"]
}
```

#### DELETE `/api/chats/:id/participants/:userId`
Removes participant.

#### PATCH `/api/chats/:id/admin`
Body:

```json
{
  "userId": "memberToPromote"
}
```

## 5. Message APIs

All `/api/messages/*` endpoints are protected.

#### POST `/api/messages/:chatId` (multipart/form-data)
Fields:
- `content` (optional string)
- `replyTo` (optional message id)
- `file` (optional upload)

You can send:
- text-only
- file-only
- text + file

Success returns created message.

#### GET `/api/messages/:chatId?page=1&limit=30`
Paginated response in `data`:

```json
{
  "data": [/* messages */],
  "totalCount": 120,
  "page": 1,
  "totalPages": 4,
  "hasNextPage": true,
  "hasPrevPage": false
}
```

#### PATCH `/api/messages/:chatId/read/all`
Marks unread messages in chat as read for current user.

#### PATCH `/api/messages/:id`
Body:

```json
{
  "content": "Edited text"
}
```

#### DELETE `/api/messages/:id`
Soft-deletes message.

## 6. Notification APIs

All `/api/notifications/*` endpoints are protected.

#### GET `/api/notifications?page=1&limit=20`
Response `data`:

```json
{
  "data": [/* notifications */],
  "totalCount": 50,
  "page": 1,
  "totalPages": 3,
  "unreadCount": 12
}
```

#### PATCH `/api/notifications/read/all`
Mark all notifications read.

#### PATCH `/api/notifications/:id/read`
Mark single notification read.

#### DELETE `/api/notifications/:id`
Delete one notification.

## 7. Validation and Error Behavior

Validation failures return `422` with structured field errors:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Invalid email" }
  ]
}
```

Common status codes:
- `400` Bad request
- `401` Unauthorized / invalid token
- `403` Forbidden
- `404` Not found
- `409` Conflict (duplicate)
- `422` Validation
- `429` Rate limit
- `500` Server error

## 8. Socket.IO Contract (Realtime)

### Connect

Client must pass JWT access token:

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: accessToken },
  withCredentials: true,
});
```

### Client -> Server events

- `chat:join` payload: `chatId: string`
- `chat:leave` payload: `chatId: string`
- `message:new` payload: `{ chatId, message, recipientIds }`
- `typing:start` payload: `chatId`
- `typing:stop` payload: `chatId`
- `message:delivered` payload: `{ messageId, chatId, senderId }`
- `message:read` payload: `{ chatId, senderId }`
- `message:edited` payload: `{ chatId, message }`
- `message:deleted` payload: `{ chatId, messageId }`
- `group:updated` payload: `{ chatId, chat }`

### Server -> Client events

- `user:online` payload: `{ userId }`
- `user:offline` payload: `{ userId }`
- `message:new` payload: `message`
- `notification:new` payload: `{ chatId, message }`
- `typing:start` payload: `{ chatId, userId }`
- `typing:stop` payload: `{ chatId, userId }`
- `message:delivered` payload: `{ messageId, chatId, deliveredBy }`
- `message:read` payload: `{ chatId, readBy }`
- `message:edited` payload: `message`
- `message:deleted` payload: `{ messageId, chatId }`
- `group:updated` payload: `chat`

## 9. RTK Query Recommended Structure

Suggested files:

- `src/store/api/baseApi.ts`
- `src/store/api/authApi.ts`
- `src/store/api/usersApi.ts`
- `src/store/api/chatsApi.ts`
- `src/store/api/messagesApi.ts`
- `src/store/api/notificationsApi.ts`

### baseApi.ts (with auto-refresh)

```ts
import { BaseQueryFn, FetchArgs, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { createApi } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../store';
import { setAccessToken, logout } from '../slices/authSlice';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: 'http://localhost:5000/api',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, unknown> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if ((result.error as any)?.status === 401) {
    const refreshResult = await rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extraOptions);

    if ((refreshResult.data as any)?.success) {
      const newAccessToken = (refreshResult.data as any).data.accessToken;
      api.dispatch(setAccessToken(newAccessToken));
      result = await rawBaseQuery(args, api, extraOptions);
    } else {
      api.dispatch(logout());
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Auth', 'Users', 'Chats', 'Messages', 'Notifications'],
  endpoints: () => ({}),
});
```

### Example: authApi.ts

```ts
import { baseApi } from './baseApi';

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    register: builder.mutation<any, { name: string; email: string; password: string }>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      invalidatesTags: ['Auth'],
    }),
    login: builder.mutation<any, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: ['Auth'],
    }),
    me: builder.query<any, void>({
      query: () => ({ url: '/auth/me' }),
      providesTags: ['Auth'],
    }),
    logout: builder.mutation<any, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Auth', 'Chats', 'Messages', 'Notifications'],
    }),
  }),
});

export const { useRegisterMutation, useLoginMutation, useMeQuery, useLogoutMutation } = authApi;
```

### Example: messagesApi.ts with FormData

```ts
import { baseApi } from './baseApi';

export const messagesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMessages: builder.query<any, { chatId: string; page?: number; limit?: number }>({
      query: ({ chatId, page = 1, limit = 30 }) => ({
        url: `/messages/${chatId}?page=${page}&limit=${limit}`,
      }),
      providesTags: (_res, _err, arg) => [{ type: 'Messages', id: arg.chatId }],
    }),

    sendMessage: builder.mutation<any, { chatId: string; content?: string; file?: File; replyTo?: string }>({
      query: ({ chatId, content, file, replyTo }) => {
        const form = new FormData();
        if (content) form.append('content', content);
        if (replyTo) form.append('replyTo', replyTo);
        if (file) form.append('file', file);

        return {
          url: `/messages/${chatId}`,
          method: 'POST',
          body: form,
        };
      },
      invalidatesTags: (_res, _err, arg) => [
        { type: 'Messages', id: arg.chatId },
        { type: 'Chats', id: 'LIST' },
        { type: 'Notifications', id: 'LIST' },
      ],
    }),

    markChatRead: builder.mutation<any, { chatId: string }>({
      query: ({ chatId }) => ({ url: `/messages/${chatId}/read/all`, method: 'PATCH' }),
      invalidatesTags: (_res, _err, arg) => [
        { type: 'Messages', id: arg.chatId },
        { type: 'Chats', id: 'LIST' },
      ],
    }),
  }),
});
```

## 10. End-to-End Frontend Flow (Recommended)

1. User logs in via `POST /api/auth/login`.
2. Save `accessToken` in auth slice.
3. Connect Socket.IO using access token in `auth.token`.
4. Fetch chats via `GET /api/chats`.
5. On chat open:
- emit `chat:join`
- fetch first page via `GET /api/messages/:chatId?page=1&limit=30`
- call `PATCH /api/messages/:chatId/read/all`
6. On send:
- call REST `POST /api/messages/:chatId` (source of truth)
- then emit `message:new` for real-time push
7. Listen for socket events (`message:new`, `typing:*`, `message:read`, `notification:new`) and update cache with `api.util.updateQueryData`.
8. On 401 from any API call, baseQuery refreshes token automatically.
9. On refresh failure, logout and clear local auth state.

## 11. Important Frontend Notes

- Always pass `credentials: 'include'`.
- For file uploads, use `FormData`; do not manually set `Content-Type` (browser sets boundary).
- Message list comes newest-first from API; reverse in UI if you render oldest at top.
- Keep socket and RTK cache in sync using optimistic updates + server reconciliation.
- Use polling fallback for notifications/chats if socket disconnects.

---

If you want, next step can be generating ready-to-use frontend files (`baseApi.ts`, `authApi.ts`, `chatsApi.ts`, `messagesApi.ts`, `notificationsApi.ts`, and socket service) directly matching this contract.
