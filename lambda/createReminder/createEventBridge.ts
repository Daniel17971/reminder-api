import { SchedulerClient, CreateScheduleCommand } from '@aws-sdk/client-scheduler';

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

const scheduler = new SchedulerClient({});

/**
 * Creates an EventBridge schedule for the reminder based on the date and time
 * The schedule will trigger the notification Lambda function at the specified time
 */
export async function createEventBridge(reminder: ReminderItem): Promise<void> {
  const notificationLambdaArn = process.env.NOTIFICATION_LAMBDA_ARN;
  const schedulerRoleArn = process.env.SCHEDULER_ROLE_ARN;

  if (!notificationLambdaArn || !schedulerRoleArn) {
    throw new Error('NOTIFICATION_LAMBDA_ARN or SCHEDULER_ROLE_ARN environment variables not set');
  }

  // Parse date and time to create a cron expression
  // date format: "YYYY-MM-DD", time format: "HH:MM" (24-hour format)
  const [year, month, day] = reminder.date.split('-');
  const [hour, minute] = reminder.time.split(':');

  // Create cron expression (minute hour day month ? year)
  // EventBridge cron format: cron(minute hour day month ? year)
  const cronExpression = `cron(${minute} ${hour} ${day} ${month} ? ${year})`;

  // Schedule name must be unique and follow naming constraints
  // Using format: reminder-{userId}-{reminderId}
  const scheduleName = `reminder-${reminder.userId}-${reminder.reminderId}`;

  // Prepare the payload for the notification Lambda
  const payload = {
    userId: reminder.userId,
    reminderId: reminder.reminderId,
    title: reminder.title,
    body: reminder.description,
    snsTopicArn: process.env.SNS_TOPIC_ARN,
  };

  try {
    await scheduler.send(
      new CreateScheduleCommand({
        Name: scheduleName,
        ScheduleExpression: cronExpression,
        FlexibleTimeWindow: {
          Mode: 'OFF', // No flexible window
        },
        Target: {
          Arn: notificationLambdaArn,
          RoleArn: schedulerRoleArn,
          Input: JSON.stringify(payload),
        },
        Description: `Reminder notification for ${reminder.title} (${reminder.event_type})`,
        State: 'ENABLED',
      })
    );

    console.log('EventBridge schedule created:', scheduleName, 'for time:', cronExpression);
  } catch (error) {
    console.error('Error creating EventBridge schedule:', error);
    throw error;
  }
}