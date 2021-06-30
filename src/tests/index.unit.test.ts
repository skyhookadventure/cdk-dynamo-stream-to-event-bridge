import {
  haveResourceLike,
  expect as expectCDK,
  SynthUtils,
} from "@aws-cdk/assert";
import { Stack } from "@aws-cdk/core";
import { Table, AttributeType, StreamViewType } from "@aws-cdk/aws-dynamodb";
import DynamoStreamToEventBridge from "..";

class TestStack extends Stack {
  constructor() {
    super();
    const table = new Table(this, "testStack", {
      tableName: "TableName",
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
    });

    new DynamoStreamToEventBridge(this, "streamTable", {
      table,
      eventPrefix: "EventPrefix",
    });
  }
}

const testStack = new TestStack();

it("creates a Lambda function to process the Dynamo stream and emit EventBridge events", () => {
  expectCDK(testStack).to(
    haveResourceLike("AWS::Lambda::Function", {
      Environment: {
        Variables: {
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
          EVENT_BUS_ARN: {
            "Fn::Join": [
              "",
              [
                "arn:",
                {
                  Ref: "AWS::Partition",
                },
                ":events:",
                {
                  Ref: "AWS::Region",
                },
                ":",
                {
                  Ref: "AWS::AccountId",
                },
                ":event-bus/default",
              ],
            ],
          },
          EVENT_PREFIX: "EventPrefix",
        },
      },
      Handler: "index.handler",
      MemorySize: 1024,
    })
  );
});

it("creates an event source mapping", () => {
  expectCDK(testStack).to(haveResourceLike("AWS::Lambda::EventSourceMapping"));
});

it("creates an Alarm to alert on errors", () => {
  expectCDK(testStack).to(haveResourceLike("AWS::CloudWatch::Alarm"));
});

it("creates resources matching the snapshot", () => {
  expect(SynthUtils.toCloudFormation(testStack)).toMatchSnapshot();
});
