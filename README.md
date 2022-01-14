![heading](https://assets.rainmaking.cloud/images/neighborhood.png)

# Serverless Containers on AWS

## Introduction

Something quite as fundamental as running containers on AWS can quickly become confusing. How could this possibly be? Ain't the cloud supposed to make things simple? Isn't it just about loading up an instance, setup Docker and call it a day? Nope, that's not it. Last year Corey Quinn made this tongue in cheek statement that became a meme at AWS: [The 17 Ways to Run Containers on AWS](https://www.lastweekinaws.com/blog/the-17-ways-to-run-containers-on-aws/). 

![medium](https://pbs.twimg.com/media/E1vfq8qVIAUkVNK?format=jpg&name=small)

Let's be honest, that's enough to confuse any non tech savvy folk and then some. And why is it this way? Simply because each of these 17 way enables different use cases. This article is about how to run containers serverlessly for general purpose compute on AWS.

## What's in it for You

Run containers at scale with the least operational overhead by leveraging Amazon Elastic Container Service and Amazon Fargate. 

Of course Fargate is not suitable for all scenarios. AWS recommendations are as follow:

- Large workloads that need to be optimized for low overhead
- Small workloads that have occasional burst
- Tiny workloads
- Batch workloads

Fargate is really well documented here: [AWS Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html).

Finally, you can get directly to the code here: [https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers)

## Pros and Cons

### Pros

- Cost efficient through just-in-time provisionning,
- Low operational overhead by leveraging managed services,
- Runs containers (your apps) and is not a PaaS so you can change the compute platform without re-architecting the solution,
- Integrates seamlessly with AWS's microservices meshing, load balancing, IAM and monitoring services for increased operational efficiency.

### Cons

- No straightforward portability from Kubernetes clusters. Once you start orchestrating containers with K8s moving to ECS may not be simple,
- Some usage scenario may require the use of additional AWS services (ALB, EFS, etc.),
- Amazon Fargate is good for general purpose compute, may not suit HPC requirements.

##  Web Serving

ECS with Fargate is an awesome solution for web serving. It strikes a great balance between the need for low compute generally required for static serving while still allowing some server side processing. Also while S3 Static Web Sites is the go to approach for static web sites which requires a tremendous throughput at almost no cost, we found out that it's not great at serving content on the internal network where data must never leave the on-prem network.

This diagrams explains the scaffolded resources to serve web applications on Amazon Fargate with auto scaling and Blue/Green deployment using CodeDeploy.

![medium](https://assets.rainmaking.cloud/images/ecs_fargate_web_server_awshla.png)

### Bill of Material

The infrastructure described in the above diagram requires the following resources.

#### Elastic Container Service (ECS) Cluster

Hosts the service and manages capacity providers if necessary. However, since we're using Fargate it's not necessary to configure this. The best source of documentation for this service remains the official AWS documentation: [What is Amazon Elastic Container Service?](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html)

````typescript
this.ecsCluster = new Cluster(this, "ecsFargateCluster", {
    "clusterName": props.clusterName,
    "containerInsights": props.containerInsights,
    "defaultCloudMapNamespace": props.defaultCloudMapNamespaceOptions,
    "enableFargateCapacityProviders": true,
    "vpc": this.vpc
});
````
[Code in Github](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers/blob/fe5744b7f133259a8aeee3693f7ae6d3f6893ef3/stack/lib/ecs-fargate-compute-stack/ecs-fargate-compute-stack.ts#L38-L45)

#### ECS Task Definition

A task definition is required to run Docker containers in Amazon ECS. It defines how much compute and memory resource are allocated to a task and its containers. When deploying tasks using a Fargate launch type, it's required to use the [AWSVPC networking mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-networking-awsvpc.html).

````typescript
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
this.webServerTaskDefinition.addContainer(props.containerDefinition.containerName, props.containerDefinition);
````
[Code](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers/blob/fe5744b7f133259a8aeee3693f7ae6d3f6893ef3/stack/lib/ecs-fargate-compute-stack/ecs-fargate-compute-stack.ts#L82-L94)

##### One container vs multiple containers per task

It's possible to run multiple containers within a single task. However, these factors have to be considered:

- Do the containers share the same lifecycle? Obviously, stateful and stateless containers don't share the same lifecycle.
- Do the containers rely on the same underlying host?
- Do the containers share resources?
- Do the containers share volumes?

#### ECS Service

The service is the key piece that orchestrates and schedules tasks.

````typescript
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
````
[Code](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers/blob/fe5744b7f133259a8aeee3693f7ae6d3f6893ef3/stack/lib/ecs-fargate-compute-stack/ecs-fargate-compute-stack.ts#L106-L174)

#### Application Load Balancer

An application load balancer is used in this scenario to expose the services task instances. The configuration of an application load balancer for an ECS Service starts wuth the creation of at least one listener with the service as a target.

````typescript
this.webServerApplicationLoadBalancerProductionListener = this.webServerApplicationLoadBalancer.addListener("productionListener", {
    "port": 80,
    "protocol": ApplicationProtocol.HTTP
});
this.webServerApplicationLoadBalancerProductionListener.addTargets("webServerProductionTargetGroup", {
    "targets": [this.webServerFargateService.loadBalancerTarget({
        "containerName": "webServer",
        "containerPort": props.webServerContainerPort,
        "protocol": Protocol.TCP
    })],
    "deregistrationDelay": Duration.seconds(30),
    "healthCheck": {
        "enabled": true,
        "healthyHttpCodes": "200,299",
        "healthyThresholdCount": 3,
        "interval": Duration.seconds(30),
        "path": "/",
        "port": props.webServerContainerPort.toString(),
        "timeout": Duration.seconds(10),
        "unhealthyThresholdCount": 5
    },
    "port": 80,
    "protocol": ApplicationProtocol.HTTP,
    "protocolVersion": ApplicationProtocolVersion.HTTP1
});
if (props.webserverDeploymentType === DeploymentControllerType.CODE_DEPLOY) {
    this.webServerApplicationLoadBalancerTestListener = this.webServerApplicationLoadBalancer.addListener("testListener", {
        "port": props.webServerApplicationLoadBalancerProductionListenerPort || 8080,
        "protocol": props.webServerApplicationLoadBalancerProductionListenerProtocol || ApplicationProtocol.HTTP,
        "defaultAction": ListenerAction.fixedResponse(200, { "messageBody": "This is the ALB Default Action" })
    });
    const webServerTestTargetGroup = {
        "deregistrationDelay": Duration.seconds(30),
        "healthCheck": {
            "enabled": true,
            "healthyHttpCodes": "200,299",
            "healthyThresholdCount": 3,
            "interval": Duration.seconds(30),
            "path": "/",
            "port": props.webServerContainerPort.toString(),
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
````
[Code](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers/blob/fe5744b7f133259a8aeee3693f7ae6d3f6893ef3/stack/lib/ecs-fargate-compute-stack/ecs-fargate-compute-stack.ts#L106-L174)

### Costs

I'm often asked to estimate the costs of services on AWS and it's usually a task that can take forever as there so many things to consider. By experience, it's better to estimate the costs of the high value services first (ex: Amazon Transcribe), next the compute and finally the storage and networking. As always, pricing consumption remains an art at estimation but here are the general lines of costs for this stack. 

#### Application Load Balancer

AWS application load balancer usage is measured by two metrics:

- Application load balancer hour. In CA-CENTRAL-1, as of Jan. 2022, the cost is $0.02475 per hour.
- Used Application load balancer capacity unit-hour (or partial hour) LCU. It's the most difficult usage metric to calculate but fortunately it's the cheapest of the two. In CA-CENTRAL-1 it's as of Jan. 2022 $ 0.0088/LCU Hour. An LCU is a combination of four dimensions and only the dimension with the highest usage is considered:

   - Number of new connections per second averaged over an hour,
   - Active connections per minute averaged over an hour,
   - Processed bytes,
   - Rule evaluations, the first 10 rules are free, the rest are measured.

Details on AWS Application Load Balancer costs can be found here [https://aws.amazon.com/elasticloadbalancing/pricing/](https://aws.amazon.com/elasticloadbalancing/pricing/)

#### Elastic Container Service

The good news here is that ECS is basically free to use. What costs though is the compute consumption and the networking. Since we're using Fargate, costs are estimated using these dimensions:

- GB/Hour. The number of GB/hour used in a month. Simply put, a task requiring 1GB of RAM for a whole month of a Linux/X86 costs as of Jan. 2022 in CA-CENTRAL-1 costs $0.004865 per hour (720 * $0.004865 = $3.50).
- vCPU/Hour. The number of virtual CPU used by hour. Simply put, a task requiring 1 vCPU for a whole month of a Linux/X86 costs as of Jan. 2022 in CA-CENTRAL-1 costs $0.04456 per hour (720 * $0.04456 = $32.00).

Of course, that's using on-demand pricing without saving plans or spot pricing. It's possible to reduce the costs by a sizeable margin using these strategies.

For more details on pricing calculations for Fargate, head here: [https://aws.amazon.com/fargate/pricing/?nc=sn&loc=2](https://aws.amazon.com/fargate/pricing/?nc=sn&loc=2).

## Useful Links

- [The 17 Ways to Run Containers on AWS](https://www.lastweekinaws.com/blog/the-17-ways-to-run-containers-on-aws/)
- [https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
- [https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers)
- [What is Amazon Elastic Container Service?](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html)
- [AWSVPC networking mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-networking-awsvpc.html)
- [https://aws.amazon.com/elasticloadbalancing/pricing/](https://aws.amazon.com/elasticloadbalancing/pricing/)
- [https://aws.amazon.com/fargate/pricing/?nc=sn&loc=2](https://aws.amazon.com/fargate/pricing/?nc=sn&loc=2)
- [AWS CDK API Reference](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-construct-library.html)