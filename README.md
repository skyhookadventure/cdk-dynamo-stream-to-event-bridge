# cdk-dynamo-stream-to-event-bridge

[![Built with
typescript](https://badgen.net/badge/icon/typescript?icon=typescript&label)](https://www.typescriptlang.org/)

Stream events from Dynamo DB to EventBridge.

## Use

```typescript
new DynamoStreamToEventBridge(scope, 'streamTodoTable', {
  table: TodoTable,
  eventPrefix: 'EventPrefix', // e.g. Todo for events with DetailType set as TodoCreate/TodoUpdate/TodoDelete
});
```

## Built by Skyhook

This module is contributed by the team at [Skyhook](https://www.skyhookadventure.com/).
