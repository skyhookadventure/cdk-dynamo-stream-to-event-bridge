import {
  EventBridgeClient,
  PutEventsCommand,
  PutEventsCommandInput,
} from '@aws-sdk/client-eventbridge';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { GetRecordsOutput, Record } from 'aws-sdk/clients/dynamodbstreams';

const ebClient = new EventBridgeClient({});

/**
 * Unmarshall a DynamoDB record
 */
export function unmarshallRecord(record: Record): { [key: string]: unknown } {
  return unmarshall(record!.dynamodb!.NewImage || record!.dynamodb!.OldImage!);
}

export enum EventName {
  MODIFY = 'MODIFY',
  INSERT = 'INSERT',
  REMOVE = 'REMOVE',
}

export const eventNameMapping = {
  [EventName.MODIFY]: 'Update',
  [EventName.INSERT]: 'Create',
  [EventName.REMOVE]: 'Delete',
};

/**
 * Create the DetailType (event name)
 */
export function createDetailType(operation: EventName): string {
  return process.env.EVENT_PREFIX + eventNameMapping[operation];
}

/**
 * Get formatted records ready to steam to eventBridge
 */
export function getFormattedRecords(
  event: GetRecordsOutput,
): PutEventsCommandInput['Entries'] {
  return event!.Records!.map((record: Record) => {
    const detail = unmarshallRecord(record);
    return {
      DetailType: createDetailType(record.eventName as EventName),
      Detail: JSON.stringify(detail),
      Source: process.env.AWS_LAMBDA_FUNCTION_NAME,
      EventBusName: process.env.EVENT_BUS_ARN,
    };
  });
}

/**
 * DynamoDb Stream handler
 */
export async function handler(event: GetRecordsOutput): Promise<void> {
  const Entries = getFormattedRecords(event);
  const result = await ebClient.send(new PutEventsCommand({ Entries }));
  if (result.FailedEntryCount && result?.FailedEntryCount > 0) {
    throw new Error('PUT_RECORDS_TO_EVENTBRIDGE_FAIL');
  }
}
