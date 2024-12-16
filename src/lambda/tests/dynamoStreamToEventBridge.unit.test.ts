/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import {
  createDetailType,
  EventName,
  eventNameMapping,
  getFormattedRecords,
  handler,
  unmarshallRecord,
} from '../dynamoStreamEventBridge';
import mockDynamoDBStreamEvent from './mocks/mockDynamoDBStreamEvent';

beforeAll(() => {
  process.env.EVENT_PREFIX = 'Todo';
  process.env.AWS_LAMBDA_FUNCTION_NAME = 'testFunctionName';
  process.env.EVENT_BUS_ARN = 'default';
});

describe('unmarshallRecord', () => {
  it('unmarshalls a DynamoDB record, returning the row', () => {
    const res = unmarshallRecord(mockDynamoDBStreamEvent.Records![0]);
    expect(res.id).toBeTruthy();
  });

  it('unmarshalls the OldImage of a DynamoDB record,for delete events', () => {
    const mockDeleteRecord = {
      ...mockDynamoDBStreamEvent.Records![0],
      dynamodb: {
        OldImage: mockDynamoDBStreamEvent.Records![0].dynamodb?.NewImage,
        NewImage: undefined,
      },
    };
    const res = unmarshallRecord(mockDeleteRecord);
    expect(res.id).toBeTruthy();
  });
});

describe('createDetailType', () => {
  it('uses mapping that matches the snapshot for event names', () => {
    expect(eventNameMapping).toMatchInlineSnapshot(`
      {
        "INSERT": "Create",
        "MODIFY": "Update",
        "REMOVE": "Delete",
      }
    `);
  });

  it('combines the table name with the operation mapping', () => {
    const res = createDetailType(EventName.MODIFY);
    expect(res).toBe('TodoUpdate');
  });
});

describe('getFormattedRecords', () => {
  it('returns an object matching the snapshot', () => {
    const res = getFormattedRecords(mockDynamoDBStreamEvent);
    expect(res[0]).toMatchInlineSnapshot(`
      {
        "Detail": "{"id":"uuid_1","title":"Title 1"}",
        "DetailType": "TodoCreate",
        "EventBusName": "default",
        "Source": "testFunctionName",
      }
    `);
  });

  it('returns one object for each record', () => {
    const res = getFormattedRecords(mockDynamoDBStreamEvent);
    expect(res.length).toBe(mockDynamoDBStreamEvent.Records!.length);
  });
});

describe('handler', () => {
  it('puts the events to event bridge', async () => {
    const spyOn = jest
      .spyOn(EventBridgeClient.prototype, 'send')
      .mockReturnValue({} as any);
    await handler(mockDynamoDBStreamEvent);
    expect(spyOn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Entries: expect.arrayContaining([
            {
              Detail: JSON.stringify({ id: 'uuid_1', title: 'Title 1' }),
              DetailType: 'TodoCreate',
              EventBusName: 'default',
              Source: 'testFunctionName',
            },
            {
              Detail: JSON.stringify({ id: 'uuid_2', title: 'Title 2' }),
              DetailType: 'TodoCreate',
              EventBusName: 'default',
              Source: 'testFunctionName',
            },
          ]),
        }),
      }),
    );
  });

  it('fails when there is an error from Event Bridge', async () => {
    jest.spyOn(EventBridgeClient.prototype, 'send').mockReturnValue({
      FailedEntryCount: 1,
    } as any);

    await expect(() =>
      handler(mockDynamoDBStreamEvent),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"PUT_RECORDS_TO_EVENTBRIDGE_FAIL"`,
    );
  });
});
