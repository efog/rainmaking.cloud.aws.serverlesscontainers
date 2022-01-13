![heading](https://assets.rainmaking.cloud/images/neighborhood.png)

# Serverless Containers on AWS

## Introduction

Something quite as fundamental as running containers on AWS can quickly become confusing. How could this possibly be? Ain't the cloud supposed to make things simple? Isn't it just about loading up an instance, setup Docker and call it a day? Nope, that's not it. Last year Corey Quinn made this tongue in cheek statement that became a meme at AWS: [There are 17 Ways to Run Containers on AWS](https://www.lastweekinaws.com/blog/the-17-ways-to-run-containers-on-aws/). 

![medium](https://pbs.twimg.com/media/E1vfq8qVIAUkVNK?format=jpg&name=small)

Let's be honest, that's enough to confuse any non tech savvy folk and then some. And why is it this way? Simply because each of these 17 way enables different use cases. This article is about how to run containers serverlessly for general purpose compute on AWS.

## What's in it for You

Run containers at scale with the least operational overhead by leveraging Amazon Elastic Container Service and Amazon Fargate. 

This solution can be used for several use cases:

- web serving,
- batch compute,
- microservices.

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

## Use Cases 

### Web Server

ECS with Fargate is an awesome solution for web serving. It strikes a great balance between the need for low compute generally required for static serving while still allowing some server side processing. Also while S3 Static Web Sites is the go to approach for static web sites which requires a tremendous throughput at almost no cost, we found out that it's not great at serving content on the internal network where data must never leave the on-prem network.

This diagrams explains the scaffolded resources to serve web applications on Amazon Fargate with auto scaling and Blue/Green deployment using CodeDeploy.

![large](https://assets.rainmaking.cloud/images/ecs_fargate_web_server_awshla.jpg)

### Micro Services






