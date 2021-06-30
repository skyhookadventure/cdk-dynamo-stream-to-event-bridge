import { Stack, Duration } from '@aws-cdk/core';
import { Table } from '@aws-cdk/aws-dynamodb';
import { DynamoEventSource } from '@aws-cdk/aws-lambda-event-sources/lib/dynamodb';
import { SqsDlq } from '@aws-cdk/aws-lambda-event-sources/lib/sqs-dlq';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { Runtime, StartingPosition } from '@aws-cdk/aws-lambda';
import { Queue } from '@aws-cdk/aws-sqs';
import { join } from 'path';
import { EventBus } from '@aws-cdk/aws-events';
import { PolicyStatement, Effect } from '@aws-cdk/aws-iam';

/**
 * Stream DynamoDB Events to EventBridge
 *
 * Creates a lambda that streams events from your table to EventBridge. The event includes the latest table row, with
 * the following structure:
 *
 * @example
 * // Event that is streamed
 * {
 *   DetailType: TableNameUpdate, // Or e.g. TableNameDelete / TableNameCreate
 *   Detail: JSON.stringify(row), // The latest row
 *   Source: TableNameStreamToEventBridgeLambdaFunctionName
 * }
 *
 * By default this streams to the account-wide default event bus.
 */
export default class DynamoStreamToEventBridge {
  constructor(scope: Stack, id: string, table: Table, eventBus?: EventBus) {
    const { tableName } = table;

    // Get the default event bus arn for where an event Bus prop is not provided
    const defaultEventBusArn = scope.formatArn({
      service: 'events',
      resource: 'event-bus',
      resourceName: 'default',
    });

    const eventBusArn = eventBus?.eventBusArn || defaultEventBusArn;

    // Lambda to handle streaming the event
    const lambda = new NodejsFunction(scope, `${id}Function`, {
      entry: join(__dirname, './lambda/dynamoStreamEventBridge.ts'),
      runtime: Runtime.NODEJS_14_X,
      memorySize: 1024,
      description: `Streams updated rows from the table ${tableName}to EventBridge.`,
      environment: {
        TABLE_NAME: table.tableName,
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
