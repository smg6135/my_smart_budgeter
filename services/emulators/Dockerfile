FROM eclipse-temurin:21-jre-jammy AS jre
FROM node:24-bookworm-slim
COPY --from=jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="/opt/java/openjdk/bin:${PATH}"
RUN npm install -g firebase-tools@15.35.0 && firebase setup:emulators:firestore
WORKDIR /emulators
COPY firebase.json firestore.rules start.sh ./
EXPOSE 9099 8080 4001
CMD ["sh","start.sh"]
