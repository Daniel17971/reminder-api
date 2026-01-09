import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaBase from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

export class ReminderApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table for storing reminders
    const remindersTable = new dynamodb.Table(this, 'RemindersTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'reminderId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev - change for production
    });

    // SNS Topic for notifications
    const notificationTopic = new sns.Topic(this, 'ReminderNotifications', {
      displayName: 'Reminder Notifications',
    });

    // Lambda function defaults
    const lambdaDefaults: Partial<lambda.NodejsFunctionProps> = {
      runtime: lambdaBase.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: remindersTable.tableName,
        SNS_TOPIC_ARN: notificationTopic.topicArn,
      },
    };

    // Notification Handler Lambda (defined first so we can reference it in Create/Update)
    const notificationHandlerFn = new lambda.NodejsFunction(this, 'NotificationHandlerFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../lambda/notificationHandler/index.ts'),
      handler: 'handler',
    });

    // Create Reminder Lambda (with additional environment variables for EventBridge)
    const createReminderFn = new lambda.NodejsFunction(this, 'CreateReminderFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../lambda/createReminder/index.ts'),
      handler: 'handler',
      environment: {
        ...lambdaDefaults.environment,
        NOTIFICATION_LAMBDA_ARN: notificationHandlerFn.functionArn,
        // SCHEDULER_ROLE_ARN will be added after role creation
      },
    });

    // List Reminders Lambda
    const listRemindersFn = new lambda.NodejsFunction(this, 'ListRemindersFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../lambda/listReminders/index.ts'),
      handler: 'handler',
    });

    // Update Reminder Lambda (with additional environment variables for EventBridge)
    const updateReminderFn = new lambda.NodejsFunction(this, 'UpdateReminderFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../lambda/updateReminder/index.ts'),
      handler: 'handler',
      environment: {
        ...lambdaDefaults.environment,
        NOTIFICATION_LAMBDA_ARN: notificationHandlerFn.functionArn,
        // SCHEDULER_ROLE_ARN will be added after role creation
      },
    });

    // Delete Reminder Lambda
    const deleteReminderFn = new lambda.NodejsFunction(this, 'DeleteReminderFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../lambda/deleteReminder/index.ts'),
      handler: 'handler',
    });

    // Grant DynamoDB permissions to CRUD Lambdas
    remindersTable.grantReadWriteData(createReminderFn);
    remindersTable.grantReadData(listRemindersFn);
    remindersTable.grantReadWriteData(updateReminderFn);
    remindersTable.grantReadWriteData(deleteReminderFn);
    remindersTable.grantReadData(notificationHandlerFn);

    // Grant SNS publish permissions to notification handler
    notificationTopic.grantPublish(notificationHandlerFn);

    // Grant EventBridge Scheduler permissions to CRUD Lambdas
    const schedulerPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'scheduler:CreateSchedule',
        'scheduler:DeleteSchedule',
        'scheduler:GetSchedule',
        'scheduler:UpdateSchedule',
      ],
      resources: ['*'],
    });

    createReminderFn.addToRolePolicy(schedulerPolicy);
    updateReminderFn.addToRolePolicy(schedulerPolicy);
    deleteReminderFn.addToRolePolicy(schedulerPolicy);

    // IAM Role for EventBridge Scheduler to invoke the notification Lambda
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    notificationHandlerFn.grantInvoke(schedulerRole);

    // Grant CRUD Lambdas permission to pass the scheduler role
    const passRolePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [schedulerRole.roleArn],
    });
    createReminderFn.addToRolePolicy(passRolePolicy);
    updateReminderFn.addToRolePolicy(passRolePolicy);

    // Add SCHEDULER_ROLE_ARN to createReminder and updateReminder environments
    createReminderFn.addEnvironment('SCHEDULER_ROLE_ARN', schedulerRole.roleArn);
    updateReminderFn.addEnvironment('SCHEDULER_ROLE_ARN', schedulerRole.roleArn);

    // REST API Gateway
    const api = new apigateway.RestApi(this, 'ReminderApi', {
      restApiName: 'Reminder Service',
      description: 'API for managing reminders',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // API Resources: /users/{userId}/reminders
    const usersResource = api.root.addResource('users');
    const userResource = usersResource.addResource('{userId}');
    const remindersResource = userResource.addResource('reminders');
    const reminderResource = remindersResource.addResource('{reminderId}');

    // API Methods
    remindersResource.addMethod('POST', new apigateway.LambdaIntegration(createReminderFn));
    remindersResource.addMethod('GET', new apigateway.LambdaIntegration(listRemindersFn));
    reminderResource.addMethod('PUT', new apigateway.LambdaIntegration(updateReminderFn));
    reminderResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteReminderFn));

    // Stack Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: remindersTable.tableName,
      description: 'DynamoDB Table Name',
    });

    new cdk.CfnOutput(this, 'SnsTopicArn', {
      value: notificationTopic.topicArn,
      description: 'SNS Topic ARN for notifications',
    });

    new cdk.CfnOutput(this, 'SchedulerRoleArn', {
      value: schedulerRole.roleArn,
      description: 'IAM Role ARN for EventBridge Scheduler',
    });

    new cdk.CfnOutput(this, 'NotificationLambdaArn', {
      value: notificationHandlerFn.functionArn,
      description: 'Notification Lambda ARN (target for EventBridge schedules)',
    });
  }
}
