import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { SchedulerClient, DeleteScheduleCommand } from '@aws-sdk/client-scheduler';

const dynamodb = new DynamoDBClient({});
const scheduler = new SchedulerClient({});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.pathParameters?.userId;
    const reminderId = event.pathParameters?.reminderId;

    if (!userId || !reminderId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'userId and reminderId are required' }),
      };
    }

    const tableName = process.env.TABLE_NAME;
    if (!tableName) {
      throw new Error('TABLE_NAME environment variable not set');
    }

    // Delete the reminder from DynamoDB
    await dynamodb.send(
      new DeleteCommand({
        TableName: tableName,
        Key: {
          userId,
          reminderId,
        },
      })
    );

    // Delete the associated EventBridge schedule
    // Schedule name format: reminder-{userId}-{reminderId}
    const scheduleName = `reminder-${userId}-${reminderId}`;
    try {
      await scheduler.send(
        new DeleteScheduleCommand({
          Name: scheduleName,
        })
      );
      console.log('EventBridge schedule deleted:', scheduleName);
    } catch (scheduleError) {
      // If schedule doesn't exist, continue - it may not have been created yet
      console.log('Schedule not found or already deleted:', scheduleName);
    }

    console.log('Reminder deleted:', reminderId, 'for user:', userId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Reminder deleted successfully',
        userId,
        reminderId,
      }),
    };
  } catch (error) {
    console.error('Error deleting reminder:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to delete reminder',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
