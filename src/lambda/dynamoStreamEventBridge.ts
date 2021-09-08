/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable no-underscore-dangle */
import { DynamoDB, EventBridge } from 'aws-sdk';
import { GetRecordsOutput, Record } from 'aws-sdk/clients/dynamodbstreams';

/**
 * Initialise an EventBridge instance (for caching across invocations of this lambda)
 */
export const eventBridge = new EventBridge();

/**
 * Unmarshall a DynamoDB record
 */
export function unmarshallRecord(record: Record): { [key: string]: any } {
  return DynamoDB.Converter.unmarshall(
    record!.dynamodb!.NewImage || record!.dynamodb!.OldImage!
  );
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
  event: GetRecordsOutput
): EventBridge.PutEventsRequest['Entries'] {
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
  const result = await eventBridge.putEvents({ Entries }).promise();
  if (result.FailedEntryCount && result?.FailedEntryCount > 0) {
    throw new Error('PUT_RECORDS_TO_EVENTBRIDGE_FAIL');
  }
}
