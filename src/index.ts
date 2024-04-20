import { Duration, Stack } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import {
  DynamoEventSource,
  SqsDlq,
} from 'aws-cdk-lib/aws-lambda-event-sources';

import { IEventBus } from 'aws-cdk-lib/aws-events';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { join } from 'path';

export interface DynamoStreamToEventBridgeProps {
  table: ITable;
  /** Event name prefix (e.g. `Todo` for TodoCreate/TodoUpdate/TodoDelete) */
  eventPrefix: string;
  /** Event Bus (optional - defaults to the account default event bus) */
  eventBus?: IEventBus;
}

/**
 * Stream DynamoDB Events to EventBridge
 *
 * Creates a lambda that streams events from your table to EventBridge. The event includes the latest table row, with
 * the following structure:
 *
 * @example
 * // Event that is streamed
 * {
 *   DetailType: EventPrefixUpdate, // Or e.g. EventPrefixDelete / EventPrefixCreate
 *   Detail: JSON.stringify(row), // The latest row
 *   Source: TableNameStreamToEventBridgeLambdaFunctionName
 * }
 *
 * By default this streams to the account-wide default event bus.
 */
export default class DynamoStreamToEventBridge {
  constructor(
    scope: Construct,
    id: string,
    { table, eventPrefix, eventBus }: DynamoStreamToEventBridgeProps
  ) {
    const { tableName } = table;

    // Get the default event bus arn for where an event Bus prop is not provided
    const defaultEventBusArn = Stack.of(scope).formatArn({
      service: 'events',
      resource: 'event-bus',
      resourceName: 'default',
    });

    const eventBusArn = eventBus?.eventBusArn || defaultEventBusArn;

    // Lambda to handle streaming the event
    const lambda = new NodejsFunction(scope, `${id}Function`, {
      entry: join(__dirname, './lambda/dynamoStreamEventBridge.js'), // Will be compiled in the node module
      memorySize: 1024,
      description: `Streams updated rows from the table ${tableName}to EventBridge.`,
      environment: {
        EVENT_PREFIX: eventPrefix,
        EVENT_BUS_ARN: eventBusArn,
      },
      // Event bridge permissions
      initialPolicy: [
        new PolicyStatement({
          resources: [eventBusArn],
          actions: ['events:PutEvents'],
          effect: Effect.ALLOW,
        }),
      ],
    });

    // Table stream permissions
    table.grantStreamRead(lambda);

    // DLQ
    const deadLetterQueue = new Queue(scope, `${id}DLQ`, {
      queueName: `${tableName}StreamToEventBridgeDLQ`,
      retentionPeriod: Duration.days(14),
      visibilityTimeout: Duration.minutes(2),
    });

    // Event mapping
    lambda.addEventSource(
      new DynamoEventSource(table, {
        startingPosition: StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        bisectBatchOnError: true,
        onFailure: new SqsDlq(deadLetterQueue),
        retryAttempts: 10,
      })
    );

    // Alarm for errors
    const metric = deadLetterQueue.metricNumberOfMessagesSent({
      period: Duration.minutes(60),
    });
    metric.createAlarm(scope, `${id}Alarm`, {
      alarmName: `${tableName}StreamToEventBridge`,
      alarmDescription:
        'Alert when a record has failed to stream to event bridge using cdk-dynamo-stream-to-event-bridge.',
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
    });

    // Event source mapping, to allow re-processing of the items in the DLQ by simply enabling this.
    lambda.addEventSourceMapping(`${id}DLQMapping`, {
      eventSourceArn: deadLetterQueue.queueArn,
      enabled: false,
      batchSize: 10,
    });
    deadLetterQueue.grantConsumeMessages(lambda);
  }
}
