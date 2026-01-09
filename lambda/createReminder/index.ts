import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import {createEventBridge} from './createEventBridge'

interface ReminderRequest {
  title: string;
  description?: string;
  date: string;
  time: string; // Format: "HH:MM" (24-hour format)
  event_type: 'birthday' | 'holiday' | 'anniversery' | 'event' | 'other';
  reminder_method: ('sms' | 'email' | 'push' | 'google_calendar')[];
  recurring?: 'day' | 'week' | 'four_week' | 'month' | 'year';
  reminders: {
    value: number;
    time: 'minute' | 'hour' | 'day' | 'week' | 'month';
  }[];
}

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

    const body: ReminderRequest = event.body ? JSON.parse(event.body) : {};

    // Validate required fields
    const requiredFields = ['title', 'date', 'time', 'event_type', 'reminder_method', 'reminders'];
    const missingFields = requiredFields.filter(field => !(field in body));

    if (missingFields.length > 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `Missing required fields: ${missingFields.join(', ')}` }),
      };
    }

    // Generate reminderId and create reminder object
    const reminderId = randomUUID();
    const reminder: ReminderItem = {
      userId,
      reminderId,
      title: body.title,
      description: body.description || '',
      date: body.date,
      time: body.time,
      event_type: body.event_type,
      reminder_method: body.reminder_method,
      reminders: body.reminders,
    };

    // Add optional recurring field if provided
    if (body.recurring) {
      reminder.recurring = body.recurring;
    }

    // Save to DynamoDB
    const tableName = process.env.TABLE_NAME;
    if (!tableName) {
      throw new Error('TABLE_NAME environment variable not set');
    }

    await dynamodb.send(
      new PutCommand({
        TableName: tableName,
        Item: reminder,
      })
    );

    console.log('Reminder created:', reminderId, 'for user:', userId);

    // Create eventbridge event to trigger notifications lambda
    await createEventBridge(reminder);

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Reminder created successfully',
        reminder,
      }),
    };
  } catch (error) {
    console.error('Error creating reminder:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to create reminder',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
