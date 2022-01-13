import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import BaseStackProps from './base-stack-props';
import EcsFargateComputeStack from './ecs-fargate-compute-stack/ecs-fargate-compute-stack';
import EcsFargateComputeStackProps from './ecs-fargate-compute-stack/ecs-fargate-compute-stack-props';
import WebServerEcsFargateTaskProps from './ecs-fargate-compute-stack/web-server-ecs-fargate-task-props';
import DefaultVpc from './default-vpc/default-vpc';
import { AwsLogDriver, Compatibility, ContainerImage, DeploymentControllerType, Protocol } from 'aws-cdk-lib/aws-ecs';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IpAddressType } from 'aws-cdk-lib/aws-elasticloadbalancingv2';

import * as debug from "debug";
const trace = debug("TRACE:ServerlessContainersStack");
const info = debug("INFO:ServerlessContainersStack");
const warn = debug("WARN:ServerlessContainersStack");
const error = debug("ERROR:ServerlessContainersStack");

/**
 * Serverless Containers module stack
 */
export class ModuleStack extends Stack {

    public ecsFargateCluster: EcsFargateComputeStack;

    /**
     * Default constructor
     * @param scope Parent stack scope
     * @param id stack id
     * @param props stack props
     */
    constructor(scope: Construct, id: string, props?: StackProps) {

        super(scope, id, props);
        info(`Scaffolding started`);
        trace(`creating vpc`);
        const vpcStack = new DefaultVpc(this, "vpc", {});
        trace(`created vpc`);

        const baseProps = new BaseStackProps(props);
        const ecsFargateClusterProps = new EcsFargateComputeStackProps(baseProps);
        ecsFargateClusterProps.targetVpc = vpcStack.vpc;
        this.ecsFargateCluster = new EcsFargateComputeStack(this, "cluster", ecsFargateClusterProps);

        const repository = Repository.fromRepositoryName(this, "webServerContainerRepository", process.env.AWSCDK_ECS_WEBSERVER_CONTAINER_REPOSITORY_NAME || "");
        const image = ContainerImage.fromEcrRepository(repository, "develop");
        const ecsFargateWebServerProps = new WebServerEcsFargateTaskProps(baseProps);
        const executionRole = new Role(this, "webServerExecutionRole", {
            "roleName": "webServerClusterExecutionRole",
            "assumedBy": new ServicePrincipal("ecs-tasks.amazonaws.com"),
            "description": "Role for agent task",
            "inlinePolicies": {
                "cloudwatch": new PolicyDocument({
                    "assignSids": true,
                    "statements": [
                        new PolicyStatement({
                            "effect": Effect.ALLOW,
                            "actions": ["logs:CreateLogStream"],
                            "resources": [`arn:aws:logs:*:${Stack.of(this).account}:log-group:*`]
                        }),
                        new PolicyStatement({
                            "effect": Effect.ALLOW,
                            "actions": ["logs:PutLogEvents"],
                            "resources": [`arn:aws:logs:*:${Stack.of(this).account}:log-group:*:log-stream:*`]
                        })
                    ]
                })
            }
        });
        repository.grantPull(executionRole);
        const taskRole = new Role(this, "webServerTaskRole", {
            "roleName": "webServerClusterTaskRole",
            "assumedBy": new ServicePrincipal("ecs-tasks.amazonaws.com"),
            "description": "Role for website task"
        });
        const webServerLogGroup = new LogGroup(this, "webServerLogGroup", {
            "retention": RetentionDays.ONE_DAY
        });
        webServerLogGroup.grantWrite(executionRole);
        ecsFargateWebServerProps.applicationLoadBalancerProps = {
            "vpc": vpcStack.vpc,
            "vpcSubnets": vpcStack.publicSubnets,
            "internetFacing": true,
            "ipAddressType": IpAddressType.IPV4,
            "http2Enabled": true
        }
        ecsFargateWebServerProps.applicationLoadBalancerSubnets = vpcStack.publicSubnets;
        ecsFargateWebServerProps.containerDefinition = {
            "cpu": 256,
            "memoryLimitMiB": 512,
            "memoryReservationMiB": 512,
            "portMappings": [{
                "containerPort": 8080,
                "protocol": Protocol.TCP
            }],
            "privileged": false,
            "startTimeout": Duration.seconds(30),
            "stopTimeout": Duration.seconds(10),
            "containerName": "webServer",
            "image": image,
            "healthCheck": {
                "command": ["touch ~ || exit 1"],
                "interval": Duration.seconds(15),
                "retries": 3,
                "startPeriod": Duration.seconds(120),
                "timeout": Duration.seconds(5)
            },
            "logging": new AwsLogDriver({
                "logGroup": webServerLogGroup,
                "streamPrefix": "webServer"
            })
        };
        ecsFargateWebServerProps.containerRepository = repository;
        ecsFargateWebServerProps.targetSubnets = vpcStack.publicSubnets?.subnets || [];
        ecsFargateWebServerProps.vpc = vpcStack.vpc;
        ecsFargateWebServerProps.webserverDeploymentType = DeploymentControllerType.ECS;
        ecsFargateWebServerProps.webServerDesiredTaskCount = 0;
        ecsFargateWebServerProps.webServerTaskDefinitionProps = {
            "executionRole": executionRole,
            "taskRole": taskRole,
            "compatibility": Compatibility.FARGATE,
            "cpu": "256",
            "memoryMiB": "512"
        };

        this.ecsFargateCluster.addWebServer(ecsFargateWebServerProps);
        info(`Scaffolding ended`);
    }
}
