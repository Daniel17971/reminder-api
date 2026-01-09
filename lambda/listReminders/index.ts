import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

interface ReminderItem {
  userId: string;
  reminderId: string;
  title: string;
  description: string;
  date: string;
  time: string; // Format: "HH:MM" (24-hour format)
  event_type: string;
  reminder_method: string[];
  recurring?: string;
  reminders: { value: number; time: string }[];
}

const dynamodb = new DynamoDBClient({});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.pathParameters?.userId;

    if (!userId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'userId is required' }),
      };
    }

    const tableName = process.env.TABLE_NAME;
    if (!tableName) {
      throw new Error('TABLE_NAME environment variable not set');
    }

    // Query DynamoDB for all reminders with this userId
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      })
    );

    const reminders: ReminderItem[] = (result.Items || []) as ReminderItem[];

    console.log(`Retrieved ${reminders.length} reminders for user:`, userId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Reminders retrieved successfully',
        userId,
        count: reminders.length,
        reminders,
      }),
    };
  } catch (error) {
    console.error('Error listing reminders:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to retrieve reminders',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
