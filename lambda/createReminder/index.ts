import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const userId = event.pathParameters?.userId;
  const body = event.body ? JSON.parse(event.body) : {};

  // TODO: Implement reminder creation logic
  // 1. Generate a unique reminderId (e.g., using uuid)
  // 2. Parse the request body for: title, body, triggerAt
  // 3. Save to DynamoDB using TABLE_NAME env var
  // 4. Create an EventBridge schedule for the triggerAt time
  // 5. Return the created reminder

  console.log('Creating reminder for user:', userId);
  console.log('Request body:', body);

  return {
    statusCode: 201,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      message: 'TODO: Implement createReminder',
      userId,
    }),
  };
};
