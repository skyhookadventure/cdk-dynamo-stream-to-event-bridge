import { GetRecordsOutput } from '@aws-sdk/client-dynamodb-streams';

const mockDynamoDBStreamEvent: GetRecordsOutput = {
  Records: [
    {
      eventID: 'af33ae05410e0b17dd69b8955217552d',
      eventName: 'INSERT',
      eventVersion: '1.1',
      eventSource: 'aws:dynamodb',
      awsRegion: 'eu-west-1',
      dynamodb: {
        Keys: {
          id: {
            S: 'uuid_1',
          },
        },
        NewImage: {
          id: {
            S: 'uuid_1',
          },
          title: {
            S: 'Title 1',
          },
        },
        SequenceNumber: '6500000000059916165564',
        SizeBytes: 555,
        StreamViewType: 'NEW_IMAGE',
      },
    },
    {
      eventID: 'af33ae05410e0b17dd69b8955217552d',
      eventName: 'INSERT',
      eventVersion: '1.1',
      eventSource: 'aws:dynamodb',
      awsRegion: 'eu-west-1',
      dynamodb: {
        Keys: {
          id: {
            S: 'uuid_2',
          },
        },
        NewImage: {
          id: {
            S: 'uuid_2',
          },
          title: {
            S: 'Title 2',
          },
        },
        SequenceNumber: '6500000000059916165564',
        SizeBytes: 555,
        StreamViewType: 'NEW_IMAGE',
      },
    },
  ],
};

export default mockDynamoDBStreamEvent;
