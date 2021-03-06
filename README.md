![heading](https://assets.rainmaking.cloud/images/neighborhood.jpg)

# Serverless Containers on AWS

Running containers efficiently at scale requires container orchestration, network, storage and of course compute. Elastic Kubernetes Service (EKS) or Elastic Container Service (ECS) are both great container orchestration solutions. The former gives more of that "Cloud Native" flavour while the latter is the way to go for teams looking for a simpler yet very efficient solution to run containers on AWS. In both cases lies at the core the acquisition of compute resources. On AWS this means the provisioning of EC2 instances or, better yet, Serverless Resources through Amazon Fargate. Serverless is a cloud execution model which allows the acquisition of compute resources on a truly pay-per-use model which removes most operational burden from the teams.

## What's in it for You

Learn how to run containers at scale using Amazon ECS, Amazon Fargate and the CDK scaffolding provided.

What is Amazon Fargate? It's a technology that you can use with Amazon ECS or EKS to run containers without having to manage servers or clusters of Amazon EC2 instances. 

The CDK scaffolding example code can be found here: [https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers)

Using managed and serverless compute resources improves on reliability and operational efficiency. As always, keep in mind the shared responsibility model when making cloud design decisions.

Of course Amazon Fargate is not suitable for all scenarios. If you're looking for a solution that fits the following payload types, Amazon Fargate is what you need:

- Large workloads that need to be optimized for low overhead
- Small workloads that have occasional burst
- Tiny workloads
- Batch workloads

### Pros

- Cost efficient through just-in-time provisionning,
- Low operational overhead by leveraging managed services,
- Runs containers (your apps) and is not a PaaS so you can change the compute platform without re-architecting the solution,
- Integrates seamlessly with AWS's microservices meshing, load balancing, IAM and monitoring services for increased operational efficiency.

### Cons

- No straightforward portability from Kubernetes clusters. Once you start orchestrating containers with K8s moving to ECS may not be simple,
- Some usage scenario may require the use of additional AWS services (ALB, EFS, etc.),
- Amazon Fargate is good for general purpose compute, may not suit HPC requirements.

## Sample Use Case: Web Serving

Amazon Fargate is an awesome solution for web serving. It strikes a great balance between the need for low compute of static serving while still allowing some server side processing. The addition of the use of CloudFront as a CDN before the Application Load Balancer will help shrink the size of the Fargate tasks thus improving on the usage costs.

While S3 Static Web Site is the way to go for simple static web sites with unpredictable peak loads at almost no cost. Doing so doesn't quite work for serving content on an internal network where data must never leave the enterprise network, bolting on an API is not a piece of cake and it forbids server side rendering.

The following diagram explains the required resources to serve web applications on Amazon ECS with Amazon Fargate with auto scaling, load balancing and Blue/Green deployment using CodeDeploy.

![medium](https://assets.rainmaking.cloud/images/ecs_fargate_web_server_awshla.png)

### AWS Resources

The provided CDK code with this article will scaffold all the following AWS resources to get a web serving solution in no time.

#### Elastic Container Service (ECS) Cluster

An ECS cluster hosts services and manages capacity providers. In an EC2 based scenario, one or more capacity providers have to be configured along with their launch templates, auto-scaling groups and AMIs. In a Fargate based scenrion, a built-in capacity provider will be created automatically through the enableFargateCapacityProviders parameter. 

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

A task definition details how much compute and memory resources are allocated to a task and its containers. 

Since Amazon Fargate doesn't run on any EC2 instances that you own, it's necessary to use the AWS VPC network mode. In a nutshell, this means that Amazon Fargate will create for each task instance an Elastic Network Interface attached to your VPC. For an EC2 launch type, we'd have the possibility to use the common Docker network modes such as Host, Bridge or None. The AWS VPC network mode is also possible with EC2 launch type. However some thoughts have to given as to not exceed the EC2 instance attached ENIs limit. 

The other important parameter to set is the compatibility type. If the task will only run on Amazon Fargate then setting it to Compatibility.FARGATE is fine. Another option which would also work in our context is EC2_FARGATE. By selecting this second option, it would be possible to use both a configured EC2 based capacity provider along with a Fargate one. This kind of setup is generally found in context where Fargate is used to acquire peak compute resources beyond is needed in steady state.

````typescript
ecsFargateWebServerProps.webServerTaskDefinitionProps = {
    "executionRole": executionRole,
    "taskRole": taskRole,
    "cpu": "256",
    "memoryMiB": "512"
};
````
[Code in GitHub](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers/blob/09b73696cb4c60d8181fbd20ed2a96aa009afba9/stack/lib/module-stack.ts#L119-L125)


````typescript
const taskDefinitionProps = Object.assign({}, props.webServerTaskDefinitionProps, {
    "compatibility": Compatibility.FARGATE,
    "networkMode": NetworkMode.AWS_VPC,
    "inferenceAccelerators": undefined,
    "ipcMode": undefined,
    "pidMode": undefined,
    "placementConstraints": undefined
} as TaskDefinitionProps);
this.webServerTaskDefinition = new TaskDefinition(this, "webServerTaskDefinition", taskDefinitionProps);
````
[Code on GitHub](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers/blob/fe5744b7f133259a8aeee3693f7ae6d3f6893ef3/stack/lib/ecs-fargate-compute-stack/ecs-fargate-compute-stack.ts#L82-L94)

#### Container definition

A container definition is used to configure which container(s) will run in the task definition. The container definition's content instructs the Docker deamon how to run the image.

````typescript
const repository = Repository.fromRepositoryName(this, "webServerContainerRepository", process.env.AWSCDK_ECS_WEBSERVER_CONTAINER_REPOSITORY_NAME || "");
const image = ContainerImage.fromEcrRepository(repository, "develop");
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
````
[Code on GitHub](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers/blob/09b73696cb4c60d8181fbd20ed2a96aa009afba9/stack/lib/module-stack.ts#L46-L113)

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
[Code on GitHub](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers/blob/fe5744b7f133259a8aeee3693f7ae6d3f6893ef3/stack/lib/ecs-fargate-compute-stack/ecs-fargate-compute-stack.ts#L106-L174)

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
[Code on GitHub](https://github.com/efog/rainmaking.cloud.aws.serverlesscontainers/blob/fe5744b7f133259a8aeee3693f7ae6d3f6893ef3/stack/lib/ecs-fargate-compute-stack/ecs-fargate-compute-stack.ts#L106-L174)

### Networking

The sample provided with this article deploys everything in two public subnets. Although it's not the most secure approach because it leaves your task executions potentially exposed to the Internet, thightly securing the tasks with Security Groups will efficiently protect the compute resources. 
Alternatively, to deploy ECS tasks in private subnets, the use of a NAT Gateway quickly becomes mandatory. In such network setup, it's recommended to have a proper thinking on VPC endpoints. They do are helpful on privae subnets based setup but comes at costs and not every AWS services are available. Here's a list of all the VPC endpoints which are minimally required if you opt for the private subnets route:

- Amazon S3 (please read [this](https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html#ecr-setting-up-s3-gateway)),
- Amazon ECR,
- Amazon ECS (agent, telemetry, ECS).

### Monitoring

Basic monitoring is achievable with the sample's setup. However, it becomes quickly necessary to consider turning on the container insights metrics to get more granular details on the containers behaviors. In turn, this will enable more fine grained scaling scenarios. 

### Costs

I'm often asked to estimate the costs of services on AWS and it's usually a task that can take forever as there are so many things to consider. By experience, it's better to estimate the costs of high value services first (ex: EC2, Fargate, Amazon Transcribe, etc.). As always, pricing estimation remains what is it (an educated guess) but here are basic starting points which give a pretty good overview. All prices below are as of Jan. 2022 in CA-CENTRAL-1 region. 

#### Application Load Balancer Costs

AWS application load balancer usage is measured with two metrics:

- Application load balancer hour. The cost is $0.02475 per hour.
- Used Application load balancer capacity unit-hour (or partial hour) LCU. It's the most difficult usage metric to calculate but fortunately it's the cheapest of the two. It costs $ 0.0088/LCU Hour. An LCU is a combination of four dimensions and only the dimension with the highest usage is considered:

   - Number of new connections per second averaged over an hour,
   - Active connections per minute averaged over an hour,
   - Processed bytes,
   - Rule evaluations, the first 10 rules are free, the rest are measured.

Details on AWS Application Load Balancer costs can be found here [https://aws.amazon.com/elasticloadbalancing/pricing/](https://aws.amazon.com/elasticloadbalancing/pricing/)

Total: 20.00 USD per month.

#### Elastic Container Service Costs

The good news here is that ECS is basically free to use. What costs though is the compute consumption and the networking. Since we're using Fargate, costs are based on these dimensions:

- GB/Hour. The number of GB/hour used in a month. A task requiring 1GB of RAM of a Linux/X86 costs $0.004865 per hour (720 * $0.004865 = $3.50/month).
- vCPU/Hour. The number of virtual CPU used by hour. A task requiring 1 vCPU of a Linux/X86 costs $0.04456 per hour (720 * $0.04456 = $32.00/month).

Total: 35.50 USD per month.

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