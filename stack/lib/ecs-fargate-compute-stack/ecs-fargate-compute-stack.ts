import { Duration, Stack } from "aws-cdk-lib";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import EcsFargateComputeStackProps from "./ecs-fargate-compute-stack-props";

import * as debug from "debug";
import { Cluster, Compatibility, DeploymentController, DeploymentControllerType, FargatePlatformVersion, FargateService, NetworkMode, Protocol, TaskDefinition, TaskDefinitionProps } from "aws-cdk-lib/aws-ecs";
import WebServerEcsFargateTaskProps from "./web-server-ecs-fargate-task-props";
import { IVpc, Peer, Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { ApplicationListener, ApplicationLoadBalancer, ApplicationLoadBalancerProps, ApplicationProtocol, ApplicationProtocolVersion, ApplicationTargetGroup, ApplicationTargetGroupProps, ListenerAction, Protocol as AlbProtocol, TargetType } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { PredefinedMetric, ScalableTarget, ServiceNamespace, TargetTrackingScalingPolicy } from "aws-cdk-lib/aws-applicationautoscaling";
const trace = debug("TRACE:ServerlessContainersStack:EcsFargateComputeStack");
const info = debug("INFO:ServerlessContainersStack:EcsFargateComputeStack");
const warn = debug("WARN:ServerlessContainersStack:EcsFargateComputeStack");
const error = debug("ERROR:ServerlessContainersStack:EcsFargateComputeStack");

/**
 * Compute stack cluster running on ECS and Fargate
 */
export default class EcsFargateComputeStack extends Stack {

    private vpc: IVpc;
    public ecsCluster: Cluster;
    public webServerApplicationLoadBalancer: ApplicationLoadBalancer | null = null;
    public webServerApplicationLoadBalancerProductionListener: ApplicationListener | null = null;
    public webServerApplicationLoadBalancerTestListener: ApplicationListener | null = null;
    public webServerFargateService: FargateService;
    public webServerTaskDefinition: TaskDefinition;

    /**
     * Default constructor
     * @param scope Parent stack scope
     * @param id stack id
     * @param props stack props
     */
    constructor(scope: Construct, id: string, props: EcsFargateComputeStackProps) {
        super(scope, id, props);
        this.vpc = props.targetVpc;
        this.ecsCluster = new Cluster(this, "ecsFargateCluster", {
            "clusterName": props.clusterName,
            "containerInsights": props.containerInsights,
            "defaultCloudMapNamespace": props.defaultCloudMapNamespaceOptions,
            "enableFargateCapacityProviders": true,
            "vpc": this.vpc
        });
    }

    /**
     * Adds and configures a web server on stack's ECS Cluster
     * @param props Web Server configuration props
     */
    addWebServer(props: WebServerEcsFargateTaskProps) {

        trace(`adding webserver`);

        const executionRole = props.webServerTaskDefinitionProps.executionRole;
        if (!executionRole) {
            error("executionRole is not defined");
            throw new Error("executionRole is not defined");
        }

        const taskRole = props.webServerTaskDefinitionProps.taskRole;
        if (!taskRole) {
            error("TaskRole is not defined");
            throw new Error("TaskRole is not defined");
        }

        const applicationLoadBalancerSecurityGroup = new SecurityGroup(this, "albSecurityGroup", {
            "description": "Web Serving ALB security group",
            "vpc": this.vpc,
            "allowAllOutbound": true
        });
        applicationLoadBalancerSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80), "allow calls to alb", false);

        const webServerServiceSecurityGroup = new SecurityGroup(this, "websiteSecurityGroup", {
            "description": "website task security group",
            "vpc": this.vpc,
            "allowAllOutbound": true
        });
        webServerServiceSecurityGroup.addIngressRule(applicationLoadBalancerSecurityGroup, Port.tcp(8080), "allow calls to website", false);

        const taskDefinitionProps = Object.assign({}, props.webServerTaskDefinitionProps, {
            "compatibility": Compatibility.FARGATE,
            "networkMode": NetworkMode.AWS_VPC,
            "executionRole": executionRole,
            "inferenceAccelerators": undefined,
            "ipcMode": undefined,
            "pidMode": undefined,
            "placementConstraints": undefined,
            "taskRole": taskRole
        } as TaskDefinitionProps);
        this.webServerTaskDefinition = new TaskDefinition(this, "webServerTaskDefinition", taskDefinitionProps);
        this.webServerTaskDefinition.addContainer(props.containerDefinition.containerName || "container0", props.containerDefinition);
        trace(`completed task definition`);

        const webApplicationLoadBalancerProps = Object.assign({
            "securityGroup": applicationLoadBalancerSecurityGroup
        }, props.applicationLoadBalancerProps as ApplicationLoadBalancerProps);
        this.webServerApplicationLoadBalancer = new ApplicationLoadBalancer(this, "webserverApplicationLoadBalancer", webApplicationLoadBalancerProps);

        this.webServerApplicationLoadBalancerProductionListener = this.webServerApplicationLoadBalancer.addListener("productionListener", {
            "port": props.webServerApplicationLoadBalancerProductionListenerPort || 80,
            "protocol": props.webServerApplicationLoadBalancerProductionListenerProtocol || ApplicationProtocol.HTTP
        });

        const deploymentController = props.webserverDeploymentType === DeploymentControllerType.ECS ? {
            "type": DeploymentControllerType.ECS
        } as DeploymentController : props.webserverDeploymentType === DeploymentControllerType.CODE_DEPLOY ? {
            "type": DeploymentControllerType.CODE_DEPLOY
        } : props.webserverExternalDeploymentController;

        this.webServerFargateService = new FargateService(this, "webserverFargateService", {
            "assignPublicIp": props.webServerAssignPublicIp,
            "cluster": this.ecsCluster,
            "vpcSubnets": props.webServerTaskSubnets,
            "taskDefinition": this.webServerTaskDefinition,
            "desiredCount": props.webServerDesiredTaskCount,
            "healthCheckGracePeriod": Duration.seconds(120),
            "platformVersion": FargatePlatformVersion.LATEST,
            "securityGroups": [webServerServiceSecurityGroup],
            "deploymentController": deploymentController
        });

        this.webServerApplicationLoadBalancerProductionListener.addTargets("webServerProductionTargetGroup", {
            "deregistrationDelay": Duration.seconds(30),
            "healthCheck": {
                "enabled": true,
                "healthyHttpCodes": "200,299",
                "healthyThresholdCount": 3,
                "interval": Duration.seconds(30),
                "path": "/",
                "port": `${props.webServerContainerPort}`,
                "timeout": Duration.seconds(10),
                "unhealthyThresholdCount": 5
            },
            "targets": [this.webServerFargateService.loadBalancerTarget({
                "containerName": "webServer",
                "containerPort": props.webServerContainerPort,
                "protocol": Protocol.TCP
            })],
            "port": 80,
            "protocol": ApplicationProtocol.HTTP,
            "protocolVersion": ApplicationProtocolVersion.HTTP1
        });

        if (props.webserverDeploymentType === DeploymentControllerType.CODE_DEPLOY) {
            this.webServerApplicationLoadBalancerTestListener = this.webServerApplicationLoadBalancer.addListener("testListener", {
                "port": props.webServerApplicationLoadBalancerProductionListenerPort || 8080,
                "protocol": props.webServerApplicationLoadBalancerProductionListenerProtocol || ApplicationProtocol.HTTP,
                "defaultAction": ListenerAction.fixedResponse(200, { "messageBody": 'This is the ALB Default Action' })
            });
            const webServerTestTargetGroup = {
                "deregistrationDelay": Duration.seconds(30),
                "healthCheck": {
                    "enabled": true,
                    "healthyHttpCodes": "200,299",
                    "healthyThresholdCount": 3,
                    "interval": Duration.seconds(30),
                    "path": "/",
                    "port": `${props.webServerContainerPort}`,
                    "protocol": AlbProtocol.HTTP,
                    "timeout": Duration.seconds(10),
                    "unhealthyThresholdCount": 5
                },
                "port": 80,
                "vpc": props.vpc,
                "protocol": ApplicationProtocol.HTTP,
                "protocolVersion": ApplicationProtocolVersion.HTTP1,
                "targetType": TargetType.IP
            } as ApplicationTargetGroupProps;
            this.webServerApplicationLoadBalancerTestListener.addTargetGroups("test", {
                "targetGroups": [new ApplicationTargetGroup(this, "websiteTargetGroupGreen", webServerTestTargetGroup)]
            });
        }
        
        const webServerAutoScalingRole = new Role(this, "webServerAutoScalingRole", {
            "assumedBy": new ServicePrincipal("application-autoscaling.amazonaws.com"),
            "managedPolicies": [{"managedPolicyArn":"arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceAutoscaleRole"}],
        });
        const webServerApplicationAutoScaling = new ScalableTarget(this, "webServerApplicationAutoScaling", {
            "serviceNamespace": ServiceNamespace.ECS,
            "scalableDimension": "ecs:service:DesiredCount",
            "resourceId": `service/${this.ecsCluster.clusterName}/${this.webServerFargateService.serviceName}`,
            "minCapacity": props.webServerMinDesiredTaskCount,
            "maxCapacity": props.webServerMaxDesiredTaskCount,
            "role": webServerAutoScalingRole
        });
        const webServerTargetTrackingScalingPolicy = new TargetTrackingScalingPolicy(this, "webServerTargetTrackingScalingPolicy", {
            "scalingTarget": webServerApplicationAutoScaling,
            "targetValue": 30,
            "predefinedMetric": PredefinedMetric.ECS_SERVICE_AVERAGE_CPU_UTILIZATION,
            "scaleInCooldown": Duration.seconds(60),
            "scaleOutCooldown": Duration.seconds(60)
        });
    }
}